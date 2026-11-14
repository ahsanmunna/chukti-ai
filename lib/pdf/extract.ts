import { getDocumentProxy } from "unpdf";
import { MAX_PDF_PAGES } from "./constants";
import { normalizeText } from "./normalize";
import {
  assessScannedPdf,
  hasPdfMagicBytes,
  isAllowedPdfMime,
  isWithinPdfSizeLimit,
} from "./validate";

export type PdfErrorCode =
  | "not_pdf"
  | "too_large"
  | "too_many_pages"
  | "encrypted"
  | "corrupt"
  | "scanned_unsupported";

export class PdfProcessingError extends Error {
  readonly code: PdfErrorCode;
  readonly httpStatus: number;

  constructor(code: PdfErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = "PdfProcessingError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface ExtractedPdfPage {
  page_number: number;
  text: string;
  char_count: number;
}

export interface PdfExtractionResult {
  pageCount: number;
  pages: ExtractedPdfPage[];
}

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontHeight: number;
}

interface LineBucket {
  anchorY: number;
  avgHeight: number;
  items: PositionedTextItem[];
}

function isPasswordError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const err = error as { name?: unknown; message?: unknown };
  if (err.name === "PasswordException") {
    return true;
  }
  if (typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    return msg.includes("password") || msg.includes("encrypted");
  }
  return false;
}

function joinLineItems(items: PositionedTextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let line = "";
  let prevEndX: number | null = null;

  for (const item of sorted) {
    const piece = item.str;
    if (piece.length === 0) {
      continue;
    }

    if (prevEndX !== null && line.length > 0) {
      const endsWithSpace = /\s$/.test(line);
      const startsWithSpace = /^\s/.test(piece);
      if (!endsWithSpace && !startsWithSpace) {
        const gap = item.x - prevEndX;
        const spaceThreshold = Math.max(1, item.fontHeight * 0.12);
        if (gap > spaceThreshold) {
          line += " ";
        }
      }
    }

    line += piece;
    prevEndX = item.x + Math.max(0, item.width);
  }

  return line.trim();
}

function computeBaseLineStep(deltas: number[]): number | null {
  const positive = deltas.filter((d) => d > 2).sort((a, b) => a - b);
  if (positive.length < 2) {
    return null;
  }
  const mid = Math.floor((positive.length - 1) / 2);
  return Math.max(8, Math.min(36, positive[mid]));
}

/**
 * Groups PDF.js text items into visual lines by y-position (top-to-bottom),
 * orders items left-to-right on each line, preserves paragraph breaks, and
 * normalizes once with normalizeText().
 */
export function groupItemsIntoNormalizedPageText(
  rawItems: ReadonlyArray<object>,
): string {
  const positioned: PositionedTextItem[] = [];

  for (const itemObj of rawItems) {
    if (!("str" in itemObj) || typeof itemObj.str !== "string" || itemObj.str.length === 0) {
      continue;
    }
    const raw = itemObj as {
      str: string;
      transform?: unknown;
      width?: unknown;
      height?: unknown;
    };
    const transform = Array.isArray(raw.transform) ? raw.transform : [];
    const x = typeof transform[4] === "number" && Number.isFinite(transform[4]) ? transform[4] : 0;
    const y = typeof transform[5] === "number" && Number.isFinite(transform[5]) ? transform[5] : 0;
    const rawHeight =
      typeof raw.height === "number" && raw.height > 0
        ? raw.height
        : typeof transform[3] === "number"
          ? Math.abs(transform[3])
          : 10;
    const fontHeight = rawHeight > 0 ? rawHeight : 10;
    const width = typeof raw.width === "number" && Number.isFinite(raw.width) ? raw.width : 0;

    positioned.push({
      str: raw.str,
      x,
      y,
      width,
      fontHeight,
    });
  }

  if (positioned.length === 0) {
    return "";
  }

  // Sort strictly top-to-bottom (higher y first in PDF user space), then left-to-right.
  positioned.sort((a, b) => (b.y !== a.y ? b.y - a.y : a.x - b.x));

  const buckets: LineBucket[] = [];
  for (const item of positioned) {
    const lastBucket = buckets[buckets.length - 1];
    if (!lastBucket) {
      buckets.push({
        anchorY: item.y,
        avgHeight: item.fontHeight,
        items: [item],
      });
      continue;
    }

    const tolerance = Math.max(2, Math.min(6, lastBucket.avgHeight * 0.45));
    if (Math.abs(item.y - lastBucket.anchorY) <= tolerance) {
      lastBucket.items.push(item);
    } else {
      buckets.push({
        anchorY: item.y,
        avgHeight: item.fontHeight,
        items: [item],
      });
    }
  }

  const nonEmptyBuckets: Array<{ y: number; text: string }> = [];
  for (const bucket of buckets) {
    const text = joinLineItems(bucket.items);
    if (text.length > 0) {
      nonEmptyBuckets.push({ y: bucket.anchorY, text });
    }
  }

  if (nonEmptyBuckets.length === 0) {
    return "";
  }

  const deltas: number[] = [];
  for (let i = 1; i < nonEmptyBuckets.length; i++) {
    deltas.push(nonEmptyBuckets[i - 1].y - nonEmptyBuckets[i].y);
  }
  const baseLineStep = computeBaseLineStep(deltas);

  const lines: string[] = [];
  for (let i = 0; i < nonEmptyBuckets.length; i++) {
    if (i > 0 && baseLineStep !== null) {
      const gap = nonEmptyBuckets[i - 1].y - nonEmptyBuckets[i].y;
      if (gap > baseLineStep * 1.75) {
        lines.push("");
      }
    }
    lines.push(nonEmptyBuckets[i].text);
  }

  return normalizeText(lines.join("\n"));
}

/**
 * Validates raw upload bytes/MIME and extracts normalized per-page text.
 *
 * PDF library choice: Chose `unpdf` because it bundles a serverless-compatible build
 * of PDF.js (`pdfjs-dist`) that runs in Next.js Node.js Route Handlers without worker
 * setup issues while exposing per-item PDF.js coordinates.
 */
export async function extractPdfPages(params: {
  bytes: Uint8Array;
  mimeType: string | null | undefined;
  filename?: string | null;
}): Promise<PdfExtractionResult> {
  const { bytes, mimeType, filename } = params;

  if (!isWithinPdfSizeLimit(bytes)) {
    throw new PdfProcessingError(
      "too_large",
      "File exceeds the 10 MB size limit.",
      413,
    );
  }

  if (!isAllowedPdfMime(mimeType, filename) || !hasPdfMagicBytes(bytes)) {
    throw new PdfProcessingError(
      "not_pdf",
      "File must be a valid PDF starting with the %PDF- header.",
      400,
    );
  }

  // Copy into an independent Uint8Array because PDF.js may transfer/detach the buffer.
  const pdfBuffer = new Uint8Array(bytes);

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    try {
      // Note: unpdf bundles pdfjs 6.4.299. The installed type definitions
      // (DocumentInitParameters) do not accept isEvalSupported.
      pdf = await getDocumentProxy(pdfBuffer, {
        useSystemFonts: false,
        verbosity: 0,
      });
    } catch (error) {
      if (isPasswordError(error)) {
        throw new PdfProcessingError(
          "encrypted",
          "This PDF is password-protected or encrypted. Remove the password and upload an unlocked PDF.",
          422,
        );
      }
      throw new PdfProcessingError(
        "corrupt",
        "Unable to parse this PDF file. It may be corrupted or malformed.",
        422,
      );
    }

    const pageCount = pdf.numPages;
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new PdfProcessingError(
        "corrupt",
        "This PDF contains no readable pages.",
        422,
      );
    }

    if (pageCount > MAX_PDF_PAGES) {
      throw new PdfProcessingError(
        "too_many_pages",
        `This PDF has ${pageCount} pages, which exceeds the ${MAX_PDF_PAGES}-page limit.`,
        422,
      );
    }

    const pages: ExtractedPdfPage[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        page.cleanup();

        const normalized = groupItemsIntoNormalizedPageText(textContent.items);
        pages.push({
          page_number: pageNumber,
          text: normalized,
          char_count: normalized.length,
        });
      }
    } catch (error) {
      if (error instanceof PdfProcessingError) {
        throw error;
      }
      if (isPasswordError(error)) {
        throw new PdfProcessingError(
          "encrypted",
          "This PDF is password-protected or encrypted. Remove the password and upload an unlocked PDF.",
          422,
        );
      }
      throw new PdfProcessingError(
        "corrupt",
        "Failed while reading pages from this PDF. The file may be corrupted.",
        422,
      );
    }

    const assessment = assessScannedPdf(pages);
    if (assessment.isScanned) {
      throw new PdfProcessingError(
        "scanned_unsupported",
        "This PDF has no usable text layer (it appears to be scanned or image-only). OCR is not supported in this version.",
        422,
      );
    }

    return { pageCount, pages };
  } finally {
    if (pdf) {
      try {
        await pdf.loadingTask.destroy();
      } catch {
        // Ignore cleanup errors on already-destroyed tasks
      }
    }
  }
}

import {
  ALLOWED_PDF_MIME_TYPE,
  MAX_PDF_BYTES,
  MAX_ZERO_TEXT_PAGE_RATIO,
  MIN_AVG_NON_WHITESPACE_CHARS_PER_PAGE,
  PDF_MAGIC_HEADER,
} from "./constants";

const MAGIC_BYTES = Array.from(PDF_MAGIC_HEADER, (char) => char.charCodeAt(0));

export interface ScannedAssessment {
  pageCount: number;
  totalNonWhitespaceChars: number;
  avgNonWhitespaceCharsPerPage: number;
  zeroTextPages: number;
  zeroTextPageRatio: number;
  isScanned: boolean;
}

/**
 * Checks whether the byte buffer starts with the exact ASCII "%PDF-" header.
 */
export function hasPdfMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < MAGIC_BYTES.length) {
    return false;
  }

  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (bytes[i] !== MAGIC_BYTES[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Validates the uploaded file MIME type and extension.
 * Rejects any explicit non-PDF MIME type; when browsers/HTTP clients omit MIME (""),
 * requires a ".pdf" filename extension (magic bytes are still checked separately).
 */
export function isAllowedPdfMime(mimeType: string | null | undefined, filename?: string | null): boolean {
  const normalizedMime = (mimeType ?? "").split(";")[0].trim().toLowerCase();

  if (normalizedMime === ALLOWED_PDF_MIME_TYPE) {
    return true;
  }

  if (normalizedMime === "") {
    const cleanName = (filename ?? "").trim().toLowerCase();
    return cleanName.endsWith(".pdf");
  }

  return false;
}

/**
 * Checks actual byte length against the 10 MiB upload limit.
 */
export function isWithinPdfSizeLimit(bytes: Uint8Array): boolean {
  return bytes.byteLength <= MAX_PDF_BYTES;
}

/**
 * Counts non-whitespace characters in a normalized page string.
 */
export function countNonWhitespaceChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * Evaluates extracted pages against the scanned-PDF thresholds:
 * scanned if avg non-whitespace chars/page < 40 OR >= 80% of pages have zero text.
 */
export function assessScannedPdf(pages: ReadonlyArray<{ text: string }>): ScannedAssessment {
  const pageCount = pages.length;
  if (pageCount === 0) {
    return {
      pageCount: 0,
      totalNonWhitespaceChars: 0,
      avgNonWhitespaceCharsPerPage: 0,
      zeroTextPages: 0,
      zeroTextPageRatio: 1,
      isScanned: true,
    };
  }

  let totalNonWhitespaceChars = 0;
  let zeroTextPages = 0;

  for (const page of pages) {
    const count = countNonWhitespaceChars(page.text);
    totalNonWhitespaceChars += count;
    if (count === 0) {
      zeroTextPages += 1;
    }
  }

  const avgNonWhitespaceCharsPerPage = totalNonWhitespaceChars / pageCount;
  const zeroTextPageRatio = zeroTextPages / pageCount;

  const isScanned =
    avgNonWhitespaceCharsPerPage < MIN_AVG_NON_WHITESPACE_CHARS_PER_PAGE ||
    zeroTextPageRatio >= MAX_ZERO_TEXT_PAGE_RATIO;

  return {
    pageCount,
    totalNonWhitespaceChars,
    avgNonWhitespaceCharsPerPage,
    zeroTextPages,
    zeroTextPageRatio,
    isScanned,
  };
}

/**
 * Sanitizes an uploaded filename for metadata-only storage and plain-text display.
 * Never used as a storage key or filesystem path.
 */
export function sanitizeOriginalFilename(rawName: string | null | undefined): string {
  const strippedPath = (rawName ?? "")
    .split(/[\\/]/)
    .pop() ?? "";
  const sanitized = Array.from(strippedPath)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      // Strip ASCII control characters and DEL
      if (code < 32 || code === 127) {
        return false;
      }
      // Strip bidi controls: U+202A-U+202E, U+2066-U+2069
      if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
        return false;
      }
      // Strip zero-width chars: U+200B-U+200D, U+FEFF
      if ((code >= 0x200b && code <= 0x200d) || code === 0xfeff) {
        return false;
      }
      return true;
    })
    .join("")
    .trim();
  if (!sanitized) {
    return "contract.pdf";
  }
  return sanitized.slice(0, 255);
}

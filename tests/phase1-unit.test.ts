import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_ZERO_TEXT_PAGE_RATIO,
  MIN_AVG_NON_WHITESPACE_CHARS_PER_PAGE,
  PdfProcessingError,
  assessScannedPdf,
  extractPdfPages,
  groupItemsIntoNormalizedPageText,
  hasPdfMagicBytes,
  isAllowedPdfMime,
  isWithinPdfSizeLimit,
  normalizeText,
  sanitizeOriginalFilename,
} from "@/lib/pdf";
import {
  DEFAULT_PLAYBOOK,
  formatPlaybookFieldErrors,
  playbookSchema,
} from "@/lib/playbook/schema";
import { generateSyntheticFixtures, type GeneratedFixturePaths } from "./generate-fixtures";

function buildMinimalEncryptedPdfBytes(): Uint8Array {
  // Minimal structurally valid PDF containing an /Encrypt dictionary in the trailer,
  // which triggers PDF.js PasswordException without needing external encryption tools.
  const pdf = [
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "endobj",
    "3 0 obj",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    "endobj",
    "4 0 obj",
    "<< /Filter /Standard /V 1 /R 2 /O (0123456789abcdef0123456789abcdef) /U (0123456789abcdef0123456789abcdef) /P -4 >>",
    "endobj",
    "xref",
    "0 5",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000185 00000 n ",
    "trailer",
    "<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<0123456789abcdef> <0123456789abcdef>] >>",
    "startxref",
    "325",
    "%%EOF",
  ].join("\n");
  return new TextEncoder().encode(pdf);
}

describe("normalizeText", () => {
  it("normalizes Unicode NFC, line endings, whitespace runs, excessive newlines, and trims", () => {
    const raw = "  Cafe\u0301   clause\t\t1 \r\n\r\n\r\n\r\nSection   2\rLine 3  \n\n\n  ";
    const normalized = normalizeText(raw);
    expect(normalized).toBe("Caf\u00e9 clause 1 \n\nSection 2\nLine 3");
  });

  it("is deterministic and idempotent", () => {
    const sample = " \tContract\r\n\r\n\r\nPayment   within   30   days\t ";
    const once = normalizeText(sample);
    const twice = normalizeText(once);
    expect(once).toBe("Contract\n\nPayment within 30 days");
    expect(twice).toBe(once);
  });
});

describe("groupItemsIntoNormalizedPageText", () => {
  it("groups items by y-position top-to-bottom and orders left-to-right", () => {
    const text = groupItemsIntoNormalizedPageText([
      { str: "world", transform: [1, 0, 0, 1, 100, 700], width: 30, height: 12 },
      { str: "Second line", transform: [1, 0, 0, 1, 50, 680], width: 60, height: 12 },
      { str: "Hello", transform: [1, 0, 0, 1, 50, 700.5], width: 28, height: 12 },
      { str: "New paragraph", transform: [1, 0, 0, 1, 50, 640], width: 80, height: 12 },
    ]);

    expect(text).toBe("Hello world\nSecond line\n\nNew paragraph");
  });
});

describe("scanned-detection thresholds", () => {
  it("exposes expected named constants", () => {
    expect(MIN_AVG_NON_WHITESPACE_CHARS_PER_PAGE).toBe(40);
    expect(MAX_ZERO_TEXT_PAGE_RATIO).toBe(0.8);
    expect(MAX_PDF_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PDF_PAGES).toBe(80);
  });

  it("flags PDFs with average < 40 non-whitespace characters per page", () => {
    const result = assessScannedPdf([
      { text: "a".repeat(39) },
      { text: "b".repeat(39) },
    ]);
    expect(result.avgNonWhitespaceCharsPerPage).toBe(39);
    expect(result.isScanned).toBe(true);
  });

  it("accepts PDFs at exactly 40 non-whitespace characters per page with no empty pages", () => {
    const result = assessScannedPdf([
      { text: "a".repeat(40) + "   \n  " },
      { text: "b".repeat(40) },
    ]);
    expect(result.avgNonWhitespaceCharsPerPage).toBe(40);
    expect(result.zeroTextPageRatio).toBe(0);
    expect(result.isScanned).toBe(false);
  });

  it("flags PDFs when >= 80% of pages have zero text even if one page has lots of text", () => {
    const result = assessScannedPdf([
      { text: "a".repeat(500) },
      { text: "" },
      { text: "" },
      { text: "" },
      { text: "" },
    ]);
    expect(result.avgNonWhitespaceCharsPerPage).toBe(100);
    expect(result.zeroTextPageRatio).toBe(0.8);
    expect(result.isScanned).toBe(true);
  });

  it("allows PDFs when < 80% of pages have zero text and average >= 40", () => {
    const result = assessScannedPdf([
      { text: "a".repeat(200) },
      { text: "b".repeat(200) },
      { text: "" },
      { text: "" },
      { text: "" },
    ]);
    expect(result.zeroTextPageRatio).toBe(0.6);
    expect(result.isScanned).toBe(false);
  });
});

describe("PDF upload guards", () => {
  it("verifies %PDF- magic bytes", () => {
    expect(hasPdfMagicBytes(new TextEncoder().encode("%PDF-1.7\n"))).toBe(true);
    expect(hasPdfMagicBytes(new Uint8Array(0))).toBe(false);
    expect(hasPdfMagicBytes(new TextEncoder().encode("%PDF"))).toBe(false);
    expect(hasPdfMagicBytes(new TextEncoder().encode("Hello plain text"))).toBe(false);
  });

  it("validates MIME type and fallback extension", () => {
    expect(isAllowedPdfMime("application/pdf", "contract.pdf")).toBe(true);
    expect(isAllowedPdfMime("application/pdf; charset=binary", "contract.pdf")).toBe(true);
    expect(isAllowedPdfMime("text/plain", "contract.pdf")).toBe(false);
    expect(isAllowedPdfMime("application/octet-stream", "contract.pdf")).toBe(false);
    expect(isAllowedPdfMime("", "contract.pdf")).toBe(true);
    expect(isAllowedPdfMime("", "contract.txt")).toBe(false);
  });

  it("checks actual byte size limit against 10 MiB", () => {
    expect(isWithinPdfSizeLimit(new Uint8Array(MAX_PDF_BYTES))).toBe(true);
    expect(isWithinPdfSizeLimit(new Uint8Array(MAX_PDF_BYTES + 1))).toBe(false);
  });

  it("sanitizes original filename for metadata display only", () => {
    expect(sanitizeOriginalFilename("../../secret/msa.pdf")).toBe("msa.pdf");
    expect(sanitizeOriginalFilename("C:\\fakepath\\contract\u0000.pdf")).toBe("contract.pdf");
    expect(sanitizeOriginalFilename("   ")).toBe("contract.pdf");
  });
});

describe("playbook zod schema", () => {
  it("provides expected starter defaults", () => {
    const parsed = playbookSchema.parse({});
    expect(parsed).toEqual(DEFAULT_PLAYBOOK);
  });

  it("accepts valid boundary and custom values", () => {
    const parsed = playbookSchema.parse({
      liability_cap: { require_cap: false, max_multiple_of_fees: 0.5 },
      payment_terms: { max_days_to_pay: 120 },
      ip_ownership: "license_only",
      termination: { min_notice_days: 0, pay_for_work_done: false },
      scope_changes: { require_written_change_order: false },
    });

    expect(parsed).toEqual({
      liability_cap: { require_cap: false, max_multiple_of_fees: 0.5 },
      payment_terms: { max_days_to_pay: 120 },
      ip_ownership: "license_only",
      termination: { min_notice_days: 0, pay_for_work_done: false },
      scope_changes: { require_written_change_order: false },
    });
  });

  it("rejects out-of-range, non-integer, invalid enum, and unknown keys with field-level messages", () => {
    const invalid = playbookSchema.safeParse({
      liability_cap: { require_cap: true, max_multiple_of_fees: 11 },
      payment_terms: { max_days_to_pay: 15.5 },
      ip_ownership: "invalid_mode",
      termination: { min_notice_days: 91, pay_for_work_done: "yes" },
      scope_changes: { require_written_change_order: true },
    });

    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const fields = formatPlaybookFieldErrors(invalid.error);
      expect(fields["liability_cap.max_multiple_of_fees"]).toBeTruthy();
      expect(fields["payment_terms.max_days_to_pay"]).toBeTruthy();
      expect(fields.ip_ownership).toBeTruthy();
      expect(fields["termination.min_notice_days"]).toBeTruthy();
      expect(fields["termination.pay_for_work_done"]).toBeTruthy();
    }
  });
});

describe("extractPdfPages with synthetic fixtures", () => {
  let fixtures: GeneratedFixturePaths;

  beforeAll(async () => {
    fixtures = await generateSyntheticFixtures();
  });

  it("extracts 3 non-empty normalized pages from fixture-synthetic-text.pdf", async () => {
    const bytes = new Uint8Array(fs.readFileSync(fixtures.textPdf));
    const result = await extractPdfPages({
      bytes,
      mimeType: "application/pdf",
      filename: "fixture-synthetic-text.pdf",
    });

    expect(result.pageCount).toBe(3);
    expect(result.pages).toHaveLength(3);
    expect(result.pages.map((p) => p.page_number)).toEqual([1, 2, 3]);
    expect(result.pages[0].text).toContain("SYNTHETIC MASTER SERVICES AGREEMENT");
    expect(result.pages[1].text).toContain("Payment Schedule");
    expect(result.pages[2].text).toContain("Limitation of Liability");
  });

  it("rejects fixture-synthetic-no-text.pdf as scanned_unsupported mentioning OCR is not supported", async () => {
    const bytes = new Uint8Array(fs.readFileSync(fixtures.noTextPdf));

    let caught: unknown = null;
    try {
      await extractPdfPages({
        bytes,
        mimeType: "application/pdf",
        filename: "fixture-synthetic-no-text.pdf",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PdfProcessingError);
    const pdfErr = caught as PdfProcessingError;
    expect(pdfErr.code).toBe("scanned_unsupported");
    expect(pdfErr.message.toLowerCase()).toContain("ocr is not supported in this version");
  });

  it("rejects renamed .txt and empty file as not_pdf", async () => {
    const txtBytes = new Uint8Array(fs.readFileSync(fixtures.renamedTxtPdf));
    const emptyBytes = new Uint8Array(fs.readFileSync(fixtures.emptyPdf));

    await expect(
      extractPdfPages({
        bytes: txtBytes,
        mimeType: "application/pdf",
        filename: "fixture-synthetic-renamed-txt.pdf",
      }),
    ).rejects.toMatchObject({ code: "not_pdf" });

    await expect(
      extractPdfPages({
        bytes: emptyBytes,
        mimeType: "application/pdf",
        filename: "fixture-synthetic-empty.pdf",
      }),
    ).rejects.toMatchObject({ code: "not_pdf" });
  });

  it("rejects corrupt PDF, > 80 pages PDF, > 10 MB payload, and encrypted PDF", async () => {
    const corruptBytes = new TextEncoder().encode("%PDF-1.4\nnot-a-valid-xref-stream");
    await expect(
      extractPdfPages({
        bytes: corruptBytes,
        mimeType: "application/pdf",
        filename: "corrupt.pdf",
      }),
    ).rejects.toMatchObject({ code: "corrupt" });

    // > 10 MB check (actual bytes)
    const oversized = new Uint8Array(MAX_PDF_BYTES + 1);
    oversized.set(new TextEncoder().encode("%PDF-1.4\n"), 0);
    await expect(
      extractPdfPages({
        bytes: oversized,
        mimeType: "application/pdf",
        filename: "oversized.pdf",
      }),
    ).rejects.toMatchObject({ code: "too_large" });

    // > 80 pages check
    const manyPageDoc = await PDFDocument.create();
    const font = await manyPageDoc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < MAX_PDF_PAGES + 1; i++) {
      const page = manyPageDoc.addPage([200, 200]);
      page.drawText(`Synthetic page ${i + 1} with enough characters to be non-empty.`, {
        x: 10,
        y: 100,
        size: 8,
        font,
      });
    }
    const manyPageBytes = await manyPageDoc.save();
    await expect(
      extractPdfPages({
        bytes: manyPageBytes,
        mimeType: "application/pdf",
        filename: "81-pages.pdf",
      }),
    ).rejects.toMatchObject({ code: "too_many_pages" });

    // Encrypted check
    const encryptedBytes = buildMinimalEncryptedPdfBytes();
    await expect(
      extractPdfPages({
        bytes: encryptedBytes,
        mimeType: "application/pdf",
        filename: "encrypted.pdf",
      }),
    ).rejects.toMatchObject({ code: "encrypted" });
  });
});

describe("fixture file presence check", () => {
  it("has all synthetic fixture files on disk", () => {
    const fixturesDir = path.resolve(process.cwd(), "tests/fixtures");
    expect(fs.existsSync(path.join(fixturesDir, "fixture-synthetic-text.pdf"))).toBe(true);
    expect(fs.existsSync(path.join(fixturesDir, "fixture-synthetic-no-text.pdf"))).toBe(true);
    expect(fs.existsSync(path.join(fixturesDir, "fixture-synthetic-renamed-txt.pdf"))).toBe(true);
    expect(fs.existsSync(path.join(fixturesDir, "fixture-synthetic-empty.pdf"))).toBe(true);
  });
});

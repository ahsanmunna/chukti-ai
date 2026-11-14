/**
 * Named upload limits and scanned-PDF detection thresholds for Phase 1.
 * Kept in one file so validation, extraction, and tests share a single source of truth.
 */

export const PDF_MAGIC_HEADER = "%PDF-";
export const ALLOWED_PDF_MIME_TYPE = "application/pdf";

export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MAX_PDF_PAGES = 80;

/** Minimum average non-whitespace characters per page required to consider a PDF text-based. */
export const MIN_AVG_NON_WHITESPACE_CHARS_PER_PAGE = 40;

/** Maximum allowed fraction of zero-text pages (0..1); >= 80% triggers scanned_unsupported. */
export const MAX_ZERO_TEXT_PAGE_RATIO = 0.8;

/** Private Supabase Storage bucket for original uploaded contract PDFs. */
export const CONTRACTS_STORAGE_BUCKET = "contracts";

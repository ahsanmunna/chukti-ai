/**
 * Deterministic text normalization run ONCE at PDF ingest.
 * Stored normalized text is the single source of truth for display and later quote verification.
 *
 * Steps:
 * 1. Unicode NFC normalization
 * 2. CRLF (and lone CR) to LF
 * 3. Collapse runs of spaces/tabs to a single space
 * 4. Collapse 3+ consecutive newlines to 2 newlines
 * 5. Trim leading and trailing whitespace
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

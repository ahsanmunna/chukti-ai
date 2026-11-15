import { buildSearchKey } from "@/lib/extraction/verify";

export type VerifyFactQuoteResult =
  | {
      valid: true;
      quote: string;
      char_start: number;
      char_end: number;
    }
  | {
      valid: false;
      reason: "evidence_too_short" | "evidence_too_long" | "evidence_not_found" | "empty_evidence";
    };

/**
 * Verifies that a facts evidence_quote is a verbatim substring of its clause text
 * using buildSearchKey from lib/extraction/verify.
 * Requires quote length between 10 and 300 characters.
 */
export function verifyFactEvidenceQuote(
  clauseText: string,
  clauseCharStart: number | null,
  rawQuote: string | null | undefined,
): VerifyFactQuoteResult {
  if (!rawQuote || rawQuote.trim().length === 0) {
    return { valid: false, reason: "empty_evidence" };
  }

  const quoteKeyResult = buildSearchKey(rawQuote);
  const quoteKey = quoteKeyResult.key;

  if (quoteKey.length < 10) {
    return { valid: false, reason: "evidence_too_short" };
  }
  if (quoteKey.length > 300) {
    return { valid: false, reason: "evidence_too_long" };
  }

  // 1. Search in clause text with drop mode first
  const dropClause = buildSearchKey(clauseText, "drop");
  let matchIndex = dropClause.key.indexOf(quoteKey);
  let matchedKey = dropClause;

  // 2. If not found, try keep mode
  if (matchIndex === -1) {
    const keepClause = buildSearchKey(clauseText, "keep");
    matchIndex = keepClause.key.indexOf(quoteKey);
    matchedKey = keepClause;
  }

  if (matchIndex === -1) {
    return { valid: false, reason: "evidence_not_found" };
  }

  const kStart = matchIndex;
  const kEnd = kStart + quoteKey.length;

  const inClauseStart = matchedKey.map[kStart];
  const lastElem = matchedKey.elements[kEnd - 1];
  const inClauseEnd = lastElem.origIndex + lastElem.origLength;

  const baseOffset = clauseCharStart ?? 0;
  const pageCharStart = baseOffset + inClauseStart;
  const pageCharEnd = baseOffset + inClauseEnd;

  const cleanQuote = clauseText.slice(inClauseStart, inClauseEnd);

  return {
    valid: true,
    quote: cleanQuote,
    char_start: pageCharStart,
    char_end: pageCharEnd,
  };
}

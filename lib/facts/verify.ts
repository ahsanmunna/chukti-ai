import { buildSearchKey, type SearchKeyResult } from "@/lib/extraction/verify";
import type { DroppedFactReason } from "./types";

export type VerifyFactQuoteResult =
  | {
      valid: true;
      quote: string;
      char_start: number;
      char_end: number;
    }
  | {
      valid: false;
      reason: DroppedFactReason;
      evidence_length: number;
    };

/**
 * Searches for a quote key in a target text using the two-mode logic from findQuote:
 * drop mode first, then keep mode.
 */
function searchInTargetText(
  targetText: string,
  quoteKey: string,
): { matchIndex: number; matchedKey: SearchKeyResult } | null {
  const dropTarget = buildSearchKey(targetText, "drop");
  const dropIdx = dropTarget.key.indexOf(quoteKey);
  if (dropIdx !== -1) {
    return { matchIndex: dropIdx, matchedKey: dropTarget };
  }
  const keepTarget = buildSearchKey(targetText, "keep");
  const keepIdx = keepTarget.key.indexOf(quoteKey);
  if (keepIdx !== -1) {
    return { matchIndex: keepIdx, matchedKey: keepTarget };
  }
  return null;
}

/**
 * Verifies that a facts evidence_quote is a verbatim substring of its clause text
 * using buildSearchKey from lib/extraction/verify with two-mode logic (drop mode first, then keep mode).
 * Evidence length limits: min 10, max 600 characters.
 *
 * If not found in the clause text, checks other clauses and page texts of the document.
 * If found elsewhere in the document, returns reason "not_in_clause_but_in_document".
 * Otherwise returns reason "not_in_document".
 */
export function verifyFactEvidenceQuote(
  clauseText: string,
  clauseCharStart: number | null,
  rawQuote: string | null | undefined,
  otherClausesTexts?: string[],
  pageTexts?: string[],
): VerifyFactQuoteResult {
  const rawLen = rawQuote ? rawQuote.length : 0;
  if (!rawQuote || rawQuote.trim().length === 0) {
    return { valid: false, reason: "missing_evidence", evidence_length: rawLen };
  }

  const quoteKeyResult = buildSearchKey(rawQuote);
  const quoteKey = quoteKeyResult.key;

  if (quoteKey.length < 10) {
    return { valid: false, reason: "too_short", evidence_length: rawLen };
  }
  if (quoteKey.length > 600 || rawQuote.length > 600) {
    return { valid: false, reason: "too_long", evidence_length: rawLen };
  }

  // 1. Match in the target clause text (drop mode first, then keep mode)
  const clauseMatch = searchInTargetText(clauseText, quoteKey);
  if (clauseMatch) {
    const kStart = clauseMatch.matchIndex;
    const kEnd = kStart + quoteKey.length;

    const inClauseStart = clauseMatch.matchedKey.map[kStart];
    const lastElem = clauseMatch.matchedKey.elements[kEnd - 1];
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

  // 2. If not in clause, check other clauses in the document
  if (otherClausesTexts && otherClausesTexts.length > 0) {
    for (const text of otherClausesTexts) {
      if (searchInTargetText(text, quoteKey)) {
        return {
          valid: false,
          reason: "not_in_clause_but_in_document",
          evidence_length: rawLen,
        };
      }
    }
  }

  // 3. Check page texts of the document
  if (pageTexts && pageTexts.length > 0) {
    for (const text of pageTexts) {
      if (searchInTargetText(text, quoteKey)) {
        return {
          valid: false,
          reason: "not_in_clause_but_in_document",
          evidence_length: rawLen,
        };
      }
    }
  }

  // 4. Not in clause, and not in document
  return {
    valid: false,
    reason: "not_in_document",
    evidence_length: rawLen,
  };
}

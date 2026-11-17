import type { ClauseType } from "@/lib/supabase/types";
import type { AnyClauseFacts, TerminationFacts } from "./types";
import { verifyFactEvidenceQuote } from "./verify";

export const CLIENT_CONVENIENCE_TERMINATION_REGEX =
  /\bClient\b(?:\s+(?:also|hereby|further))?\s+(?:may|can|is\s+entitled\s+to|has\s+the\s+right\s+to|shall\s+have\s+the\s+right\s+to)\b.*?\bterminat(?:e|es|ed|ing)?\b.*?\b(?:for\s+convenience|without\s+cause|for\s+any\s+reason|for\s+no\s+reason)\b/i;

export const IMMEDIATE_NOTICE_REGEX =
  /\b(?:with\s+immediate\s+effect|immediately)\b/i;

/**
 * Finds a matching sentence in the clause text where "Client" is followed by
 * (may | can | is entitled to | has the right to | shall have the right to) terminate,
 * and then (for convenience | without cause | for any reason | for no reason).
 * Returns the verbatim slice of that sentence from the clause text (trimmed of surrounding whitespace),
 * or null if no matching sentence is found.
 */
export function findClientConvenienceSentence(clauseText: string): string | null {
  if (!clauseText || typeof clauseText !== "string") {
    return null;
  }

  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const segment of segmenter.segment(clauseText)) {
    const raw = segment.segment;
    if (CLIENT_CONVENIENCE_TERMINATION_REGEX.test(raw)) {
      const match = raw.match(/\S(?:[\s\S]*\S)?/);
      if (match && match.index !== undefined) {
        const start = segment.index + match.index;
        const end = start + match[0].length;
        const sliced = clauseText.slice(start, end);
        if (CLIENT_CONVENIENCE_TERMINATION_REGEX.test(sliced)) {
          return sliced;
        }
      }
      const trimmed = raw.trim();
      if (CLIENT_CONVENIENCE_TERMINATION_REGEX.test(trimmed)) {
        return trimmed;
      }
    }
  }

  return null;
}

export interface ComputedClauseFactsState {
  facts: AnyClauseFacts;
  facts_evidence: string | null;
  facts_verified: boolean;
  facts_status: "extracted" | "none" | "failed";
}

export interface BackstopClauseInput {
  id: string;
  clause_type: ClauseType;
  verbatim_text: string;
  char_start?: number | null;
}

export interface BackstopResult {
  applied: boolean;
  computed: ComputedClauseFactsState;
}

/**
 * Applies lexical backstops to a clause's computed facts state.
 *
 * For termination clauses only:
 * 1. Convenience termination backstop:
 *    If client_convenience_termination is unspecified and the clause text contains
 *    a sentence where "Client" is followed by (may | can | is entitled to | has the right to | shall have the right to)
 *    terminate, then (for convenience | without cause | for any reason | for no reason), set it to "yes".
 *    Evidence quote = that matching sentence sliced verbatim from the clause text (must pass quote verification).
 *    Never override a model value of "yes" or "no".
 *
 * 2. Notice backstop:
 *    In a termination clause where client_convenience_termination is "yes" (from the model or the backstop)
 *    and notice_days is null, if the same sentence says "with immediate effect" or "immediately",
 *    set notice_days = 0.
 *    Evidence quote = that sentence sliced verbatim, must pass quote verification.
 *    Never override a non-null model value.
 */
export function applyLexicalBackstop(
  clause: BackstopClauseInput,
  current: ComputedClauseFactsState,
  otherClausesTexts?: string[],
  pageTexts?: string[],
): BackstopResult {
  if (clause.clause_type !== "termination") {
    return { applied: false, computed: current };
  }

  const termFacts = { ...(current.facts as TerminationFacts) };
  let modified = false;
  let evidenceToUse = current.facts_evidence;

  // 1. Convenience termination backstop
  if (
    termFacts.client_convenience_termination !== "yes" &&
    termFacts.client_convenience_termination !== "no"
  ) {
    const matchingSentence = findClientConvenienceSentence(clause.verbatim_text);
    if (matchingSentence) {
      const verifyResult = verifyFactEvidenceQuote(
        clause.verbatim_text,
        clause.char_start ?? 0,
        matchingSentence,
        otherClausesTexts,
        pageTexts,
      );
      if (verifyResult.valid) {
        termFacts.client_convenience_termination = "yes";
        evidenceToUse = verifyResult.quote;
        modified = true;
      }
    }
  }

  // 2. Notice backstop:
  // In a termination clause where client_convenience_termination is yes (from model or backstop)
  // and notice_days is null:
  // If the same sentence says "with immediate effect" or "immediately", set notice_days = 0.
  // Never override a non-null model value.
  if (
    termFacts.client_convenience_termination === "yes" &&
    termFacts.notice_days === null
  ) {
    const convenienceSentence = findClientConvenienceSentence(clause.verbatim_text);
    if (convenienceSentence && IMMEDIATE_NOTICE_REGEX.test(convenienceSentence)) {
      const verifyResult = verifyFactEvidenceQuote(
        clause.verbatim_text,
        clause.char_start ?? 0,
        convenienceSentence,
        otherClausesTexts,
        pageTexts,
      );
      if (verifyResult.valid) {
        termFacts.notice_days = 0;
        evidenceToUse = verifyResult.quote;
        modified = true;
      }
    }
  }

  if (!modified) {
    return { applied: false, computed: current };
  }

  return {
    applied: true,
    computed: {
      facts: termFacts,
      facts_evidence: evidenceToUse,
      facts_verified: true,
      facts_status: "extracted",
    },
  };
}

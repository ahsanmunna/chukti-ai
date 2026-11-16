import type { ClauseType } from "@/lib/supabase/types";
import type { AnyClauseFacts, TerminationFacts } from "./types";
import { verifyFactEvidenceQuote } from "./verify";

export const CLIENT_CONVENIENCE_TERMINATION_REGEX =
  /\bClient\b.*?\bterminat(?:e|es|ed|ing)?\b.*?\b(?:for\s+convenience|without\s+cause|for\s+any\s+reason|at\s+any\s+time)\b/i;

/**
 * Finds a matching sentence in the clause text where "Client" is followed by "terminate"
 * and then "for convenience" | "without cause" | "for any reason" | "at any time".
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
 * If the model returned client_convenience_termination = unspecified
 * (including facts_status "none" or an absent item) and the clause text matches a sentence
 * where "Client" is followed by "terminate" and then "for convenience" | "without cause" |
 * "for any reason" | "at any time", set it to "yes".
 * Evidence quote = that matching sentence sliced verbatim from the clause text (it must pass quote verification).
 * facts_status becomes "extracted".
 * Never override a model value of "yes" or "no".
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

  const termFacts = current.facts as TerminationFacts;
  // Never override a model value of yes or no
  if (
    termFacts.client_convenience_termination === "yes" ||
    termFacts.client_convenience_termination === "no"
  ) {
    return { applied: false, computed: current };
  }

  // Only proceed if unspecified
  const matchingSentence = findClientConvenienceSentence(clause.verbatim_text);
  if (!matchingSentence) {
    return { applied: false, computed: current };
  }

  // Quote must pass the existing quote verification
  const verifyResult = verifyFactEvidenceQuote(
    clause.verbatim_text,
    clause.char_start ?? 0,
    matchingSentence,
    otherClausesTexts,
    pageTexts,
  );

  if (!verifyResult.valid) {
    return { applied: false, computed: current };
  }

  const updatedFacts: TerminationFacts = {
    ...termFacts,
    client_convenience_termination: "yes",
  };

  return {
    applied: true,
    computed: {
      facts: updatedFacts,
      facts_evidence: verifyResult.quote,
      facts_verified: true,
      facts_status: "extracted",
    },
  };
}

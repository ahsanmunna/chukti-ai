import { z } from "zod";

export const CLAUSE_TYPES = [
  "liability",
  "payment",
  "indemnity",
  "ip_ownership",
  "termination",
  "scope_change",
  "governing_law",
  "definition",
] as const;

export type ClauseType = (typeof CLAUSE_TYPES)[number];

export const EXTRACTION_PROMPT_VERSION = "v1";

export const rawClauseSchema = z.object({
  clause_type: z.enum(CLAUSE_TYPES),
  quote: z.string(),
  page_hint: z.number().int(),
  confidence: z.enum(["low", "medium", "high"]),
});

export const extractionResponseSchema = z.object({
  clauses: z.array(rawClauseSchema).max(60),
});

export type RawClause = z.infer<typeof rawClauseSchema>;
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

export type QuoteRejectionReason = "too_short" | "too_long" | "not_found";

export interface RejectedClause {
  clause_type: ClauseType;
  reason: QuoteRejectionReason;
  quote_length: number;
}

export interface VerifiedClause {
  clause_type: ClauseType;
  verbatim_text: string;
  page_number: number;
  char_start: number;
  char_end: number;
  extraction_confidence: "low" | "medium" | "high";
  page_mismatch: boolean;
}

export interface VerificationResult {
  accepted: VerifiedClause[];
  rejected: RejectedClause[];
}

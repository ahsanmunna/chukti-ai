import { describe, expect, it } from "vitest";
import {
  CLAUSE_TYPES,
  extractionResponseSchema,
  rawClauseSchema,
} from "@/lib/extraction/types";

describe("C. Extraction: Zod Schema validation", () => {
  it("validates all 8 allowed clause types and confidence levels", () => {
    for (const type of CLAUSE_TYPES) {
      const valid = rawClauseSchema.safeParse({
        clause_type: type,
        quote: "Sample legal clause verbatim text quotation.",
        page_hint: 1,
        confidence: "high",
      });
      expect(valid.success).toBe(true);
    }

    for (const conf of ["low", "medium", "high"] as const) {
      const valid = rawClauseSchema.safeParse({
        clause_type: "liability",
        quote: "Sample legal clause verbatim text quotation.",
        page_hint: 1,
        confidence: conf,
      });
      expect(valid.success).toBe(true);
    }
  });

  it("rejects invalid clause types or invalid confidence levels", () => {
    const invalidType = rawClauseSchema.safeParse({
      clause_type: "unknown_clause_type",
      quote: "Some quote text here.",
      page_hint: 1,
      confidence: "high",
    });
    expect(invalidType.success).toBe(false);

    const invalidConf = rawClauseSchema.safeParse({
      clause_type: "liability",
      quote: "Some quote text here.",
      page_hint: 1,
      confidence: "very_high",
    });
    expect(invalidConf.success).toBe(false);
  });

  it("rejects extraction responses with more than 60 clauses", () => {
    const clauses = Array.from({ length: 61 }, (_, i) => ({
      clause_type: "payment" as const,
      quote: `Payment clause quote number ${i + 1} that is valid text.`,
      page_hint: 1,
      confidence: "medium" as const,
    }));

    const result = extractionResponseSchema.safeParse({ clauses });
    expect(result.success).toBe(false);
  });

  it("accepts valid extraction responses with up to 60 clauses", () => {
    const clauses = Array.from({ length: 60 }, (_, i) => ({
      clause_type: "payment" as const,
      quote: `Payment clause quote number ${i + 1} that is valid text.`,
      page_hint: 1,
      confidence: "medium" as const,
    }));

    const result = extractionResponseSchema.safeParse({ clauses });
    expect(result.success).toBe(true);
  });
});

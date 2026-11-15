import { describe, expect, it } from "vitest";
import {
  FACTS_PROMPT_VERSION,
  buildFactsUserPrompt,
} from "@/lib/facts/prompt";
import {
  factsResponseSchema,
  filterFactsForClauseType,
  getDefaultFactsForType,
} from "@/lib/facts/types";
import { verifyFactEvidenceQuote } from "@/lib/facts/verify";

describe("Facts Evidence Quote Verification (verifyFactEvidenceQuote)", () => {
  const clauseText =
    "Client shall pay Contractor within thirty (30) calendar days after invoice receipt. Any delay shall accrue interest.";

  it("verifies a valid exact quote and computes correct character offsets", () => {
    const rawQuote = "within thirty (30) calendar days after invoice receipt";
    const result = verifyFactEvidenceQuote(clauseText, 100, rawQuote);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.quote).toBe(rawQuote);
      expect(result.char_start).toBe(100 + clauseText.indexOf(rawQuote));
      expect(result.char_end).toBe(
        100 + clauseText.indexOf(rawQuote) + rawQuote.length,
      );
    }
  });

  it("rejects quotes shorter than 10 characters", () => {
    const shortQuote = "30 days";
    const result = verifyFactEvidenceQuote(clauseText, 0, shortQuote);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("evidence_too_short");
    }
  });

  it("rejects quotes longer than 300 characters", () => {
    const longQuote = "a".repeat(301);
    const result = verifyFactEvidenceQuote(clauseText, 0, longQuote);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("evidence_too_long");
    }
  });

  it("rejects quotes not found in clause text", () => {
    const fabricatedQuote = "Client shall pay Contractor within ninety days immediately";
    const result = verifyFactEvidenceQuote(clauseText, 0, fabricatedQuote);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("evidence_not_found");
    }
  });

  it("rejects empty or whitespace quotes", () => {
    expect(verifyFactEvidenceQuote(clauseText, 0, "").valid).toBe(false);
    expect(verifyFactEvidenceQuote(clauseText, 0, "   ").valid).toBe(false);
    expect(verifyFactEvidenceQuote(clauseText, 0, null).valid).toBe(false);
  });
});

describe("Facts Prompt Building (buildFactsUserPrompt)", () => {
  it("uses C1, C2 markers and does not leak UUIDs into prompt text", () => {
    const clauses = [
      {
        id: "11111111-2222-3333-4444-555555555555",
        clause_type: "payment" as const,
        page_number: 1,
        verbatim_text: "Payment of $500 within 15 days.",
      },
      {
        id: "99999999-8888-7777-6666-555555555555",
        clause_type: "liability" as const,
        page_number: 2,
        verbatim_text: "Liability is capped at $1000.",
      },
    ];

    const { promptText, markerMap } = buildFactsUserPrompt(clauses);

    expect(promptText).toContain("[[C1]]");
    expect(promptText).toContain("[[C2]]");
    expect(promptText).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(promptText).not.toContain("99999999-8888-7777-6666-555555555555");

    expect(markerMap.get("C1")?.id).toBe("11111111-2222-3333-4444-555555555555");
    expect(markerMap.get("C2")?.id).toBe("99999999-8888-7777-6666-555555555555");
    expect(FACTS_PROMPT_VERSION).toBe("v1");
  });
});

describe("Facts Schema & Filtering (filterFactsForClauseType & getDefaultFactsForType)", () => {
  it("parses valid LLM facts response through factsResponseSchema", () => {
    const raw = {
      items: [
        {
          clause: "[[C1]]",
          evidence_quote: "Client shall pay Contractor within 30 days of receipt",
          facts: {
            days_to_pay: 30,
            payment_trigger: "invoice_receipt",
            client_may_withhold: "no",
            total_fee_amount: 1000,
            currency: "USD",
          },
        },
      ],
    };

    const parsed = factsResponseSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it("filterFactsForClauseType extracts only pertinent fields for clause type", () => {
    const rawFacts = {
      days_to_pay: 30,
      payment_trigger: "invoice_receipt" as const,
      client_may_withhold: "no" as const,
      contractor_liability: "unlimited" as const, // Should be ignored for payment
      foreign_to_bangladesh: "yes" as const, // Should be ignored for payment
    };

    const filteredPayment = filterFactsForClauseType("payment", rawFacts);
    expect(filteredPayment).toEqual({
      total_fee_amount: null,
      currency: null,
      days_to_pay: 30,
      payment_trigger: "invoice_receipt",
      client_may_withhold: "no",
    });
    expect((filteredPayment as unknown as Record<string, unknown>).contractor_liability).toBeUndefined();
    expect((filteredPayment as unknown as Record<string, unknown>).foreign_to_bangladesh).toBeUndefined();
  });

  it("getDefaultFactsForType produces unspecified/null for all fields", () => {
    const defaultLiability = getDefaultFactsForType("liability");
    expect(defaultLiability).toEqual({
      contractor_liability: "unspecified",
      cap_multiple_of_fees: null,
    });
  });
});

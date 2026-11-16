import { describe, expect, it } from "vitest";
import {
  FACTS_PROMPT_VERSION,
  buildFactsUserPrompt,
} from "@/lib/facts/prompt";
import {
  CLIENT_MAY_WITHHOLD,
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

  it("accepts evidence with line-end hyphenated compound ('good-\\nfaith' in clause text, 'good-faith' in evidence)", () => {
    const text = "All parties agree to negotiate in good-\nfaith regarding revisions.";
    const res = verifyFactEvidenceQuote(text, 0, "good-faith");
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.quote).toBe("good-\nfaith");
    }
  });

  it("evidence with an ellipsis returns not_in_document", () => {
    const text = "Client shall pay within thirty (30) days of delivery.";
    const quoteWithEllipsis = "pay within thirty ... days of delivery";
    const res = verifyFactEvidenceQuote(text, 0, quoteWithEllipsis);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reason).toBe("not_in_document");
      expect(res.evidence_length).toBe(quoteWithEllipsis.length);
    }
  });

  it("evidence copied from a different clause returns not_in_clause_but_in_document", () => {
    const targetClause = "Payment is due within thirty days.";
    const otherClause = "Contractor liability shall be strictly capped at total fees.";
    const res = verifyFactEvidenceQuote(
      targetClause,
      0,
      "liability shall be strictly capped",
      [otherClause],
    );
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reason).toBe("not_in_clause_but_in_document");
      expect(res.evidence_length).toBe("liability shall be strictly capped".length);
    }
  });

  it("evidence copied from page text outside clauses returns not_in_clause_but_in_document", () => {
    const targetClause = "Payment is due within thirty days.";
    const pageText = "MASTER SERVICES AGREEMENT RECITALS: The company desires to retain services.";
    const res = verifyFactEvidenceQuote(
      targetClause,
      0,
      "The company desires to retain services",
      [],
      [pageText],
    );
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reason).toBe("not_in_clause_but_in_document");
    }
  });

  it("rejects evidence with 601 characters as too_long", () => {
    const longQuote = "a".repeat(601);
    const res = verifyFactEvidenceQuote(clauseText, 0, longQuote);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reason).toBe("too_long");
      expect(res.evidence_length).toBe(601);
    }
  });

  it("respects 10-character boundary (9 -> too_short, 10 -> boundary accepted)", () => {
    const text = "0123456789ABCDEF";
    const nineChar = "012345678";
    const tenChar = "0123456789";

    const resNine = verifyFactEvidenceQuote(text, 0, nineChar);
    expect(resNine.valid).toBe(false);
    if (!resNine.valid) {
      expect(resNine.reason).toBe("too_short");
      expect(resNine.evidence_length).toBe(9);
    }

    const resTen = verifyFactEvidenceQuote(text, 0, tenChar);
    expect(resTen.valid).toBe(true);
    if (resTen.valid) {
      expect(resTen.quote).toBe(tenChar);
    }
  });

  it("rejects empty or whitespace quotes with missing_evidence", () => {
    const resEmpty = verifyFactEvidenceQuote(clauseText, 0, "");
    expect(resEmpty.valid).toBe(false);
    if (!resEmpty.valid) {
      expect(resEmpty.reason).toBe("missing_evidence");
      expect(resEmpty.evidence_length).toBe(0);
    }

    const resWs = verifyFactEvidenceQuote(clauseText, 0, "   ");
    expect(resWs.valid).toBe(false);
    if (!resWs.valid) {
      expect(resWs.reason).toBe("missing_evidence");
      expect(resWs.evidence_length).toBe(3);
    }

    const resNull = verifyFactEvidenceQuote(clauseText, 0, null);
    expect(resNull.valid).toBe(false);
    if (!resNull.valid) {
      expect(resNull.reason).toBe("missing_evidence");
      expect(resNull.evidence_length).toBe(0);
    }
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
    expect(FACTS_PROMPT_VERSION).toBe("v4");
  });
});

describe("Facts Schema & Filtering (filterFactsForClauseType & getDefaultFactsForType)", () => {
  it("parses valid LLM facts response through factsResponseSchema with client_may_withhold enum", () => {
    expect(CLIENT_MAY_WITHHOLD).toContain("for_unaccepted_work");
    expect(CLIENT_MAY_WITHHOLD).toContain("disputed_portion_only");
    expect(CLIENT_MAY_WITHHOLD).toContain("no");
    expect(CLIENT_MAY_WITHHOLD).toContain("unspecified");

    const raw = {
      items: [
        {
          clause: "[[C1]]",
          evidence_quote: "Client shall pay Contractor within 30 days of receipt",
          facts: {
            days_to_pay: 30,
            payment_trigger: "invoice_receipt",
            client_may_withhold: "disputed_portion_only",
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
      client_may_withhold: "for_unaccepted_work" as const,
      contractor_liability: "unlimited" as const, // Should be ignored for payment
      foreign_to_bangladesh: "yes" as const, // Should be ignored for payment
    };

    const filteredPayment = filterFactsForClauseType("payment", rawFacts);
    expect(filteredPayment).toEqual({
      total_fee_amount: null,
      currency: null,
      days_to_pay: 30,
      payment_trigger: "invoice_receipt",
      client_may_withhold: "for_unaccepted_work",
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

    const defaultPayment = getDefaultFactsForType("payment");
    expect(defaultPayment).toEqual({
      total_fee_amount: null,
      currency: null,
      days_to_pay: null,
      payment_trigger: "unspecified",
      client_may_withhold: "unspecified",
    });
  });
});

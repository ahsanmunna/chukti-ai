import { describe, expect, it } from "vitest";
import { applyLexicalBackstop } from "@/lib/facts/backstops";
import {
  FACTS_PROMPT_VERSION,
  buildFactsUserPrompt,
} from "@/lib/facts/prompt";
import {
  CLIENT_MAY_WITHHOLD,
  type GoverningLawFacts,
  type TerminationFacts,
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
    expect(FACTS_PROMPT_VERSION).toBe("v5");
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

  it("filterFactsForClauseType correctly handles foreign_to_bangladesh post-processing", () => {
    // "England and Wales" -> yes
    const engFacts = filterFactsForClauseType("governing_law", {
      governing_law_name: "England and Wales",
      foreign_to_bangladesh: "unspecified",
    }) as GoverningLawFacts;
    expect(engFacts.foreign_to_bangladesh).toBe("yes");

    // Even if model returned "no", foreign law overrides model value
    const engOverride = filterFactsForClauseType("governing_law", {
      governing_law_name: "England and Wales",
      foreign_to_bangladesh: "no",
    }) as GoverningLawFacts;
    expect(engOverride.foreign_to_bangladesh).toBe("yes");

    // "Laws of Bangladesh" -> no
    const bdFacts = filterFactsForClauseType("governing_law", {
      governing_law_name: "Laws of Bangladesh",
      foreign_to_bangladesh: "unspecified",
    }) as GoverningLawFacts;
    expect(bdFacts.foreign_to_bangladesh).toBe("no");

    // Even if model returned "yes", Bangladesh law overrides model value to "no"
    const bdOverride = filterFactsForClauseType("governing_law", {
      governing_law_name: "Laws of Bangladesh",
      foreign_to_bangladesh: "yes",
    }) as GoverningLawFacts;
    expect(bdOverride.foreign_to_bangladesh).toBe("no");

    // null -> unchanged (keeps model value)
    const nullFactsUnspecified = filterFactsForClauseType("governing_law", {
      governing_law_name: null,
      foreign_to_bangladesh: "unspecified",
    }) as GoverningLawFacts;
    expect(nullFactsUnspecified.foreign_to_bangladesh).toBe("unspecified");

    const nullFactsYes = filterFactsForClauseType("governing_law", {
      governing_law_name: null,
      foreign_to_bangladesh: "yes",
    }) as GoverningLawFacts;
    expect(nullFactsYes.foreign_to_bangladesh).toBe("yes");
  });
});

describe("Lexical Backstops for Termination Clauses (applyLexicalBackstop)", () => {
  const clause92Text =
    "9.2 The Client may terminate this Agreement for convenience at any time, with immediate effect.";

  it("9.2 text triggers: sets client_convenience_termination to yes and verifies quote", () => {
    const clause = {
      id: "term-92",
      clause_type: "termination" as const,
      verbatim_text: clause92Text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "unspecified" as const,
        notice_days: null,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: null,
      facts_verified: false,
      facts_status: "none" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(true);
    expect((res.computed.facts as TerminationFacts).client_convenience_termination).toBe("yes");
    expect((res.computed.facts as TerminationFacts).notice_days).toBe(0);
    expect(res.computed.facts_status).toBe("extracted");
    expect(res.computed.facts_verified).toBe(true);
    expect(res.computed.facts_evidence).toBe(clause92Text);

    // Verify the sliced quote verifies with verifyFactEvidenceQuote
    const quoteVerification = verifyFactEvidenceQuote(
      clause.verbatim_text,
      clause.char_start,
      res.computed.facts_evidence,
    );
    expect(quoteVerification.valid).toBe(true);
  });

  it("'Client acknowledges that Contractor may terminate at any time' does NOT trigger backstop", () => {
    const text = "Client acknowledges that Contractor may terminate at any time.";
    const clause = {
      id: "term-ack",
      clause_type: "termination" as const,
      verbatim_text: text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "unspecified" as const,
        notice_days: null,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: null,
      facts_verified: false,
      facts_status: "none" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(false);
    expect((res.computed.facts as TerminationFacts).client_convenience_termination).toBe("unspecified");
  });

  it("'Client may terminate for cause at any time' does NOT trigger backstop", () => {
    const text = "Client may terminate for cause at any time upon material breach.";
    const clause = {
      id: "term-cause",
      clause_type: "termination" as const,
      verbatim_text: text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "unspecified" as const,
        notice_days: null,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: null,
      facts_verified: false,
      facts_status: "none" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(false);
    expect((res.computed.facts as TerminationFacts).client_convenience_termination).toBe("unspecified");
  });

  it("notice backstop: when model returns client_convenience_termination = yes and notice_days = null, sets notice_days = 0 if sentence says 'with immediate effect'", () => {
    const clause = {
      id: "term-immediate-1",
      clause_type: "termination" as const,
      verbatim_text: clause92Text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "yes" as const,
        notice_days: null,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: "Client may terminate this Agreement for convenience",
      facts_verified: true,
      facts_status: "extracted" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(true);
    expect((res.computed.facts as TerminationFacts).client_convenience_termination).toBe("yes");
    expect((res.computed.facts as TerminationFacts).notice_days).toBe(0);
    expect(res.computed.facts_evidence).toBe(clause92Text);
  });

  it("notice backstop: when model returns client_convenience_termination = yes and notice_days = null, sets notice_days = 0 if sentence says 'immediately'", () => {
    const text = "Client may terminate this Agreement without cause immediately upon written notice.";
    const clause = {
      id: "term-immediate-2",
      clause_type: "termination" as const,
      verbatim_text: text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "yes" as const,
        notice_days: null,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: "Client may terminate this Agreement without cause",
      facts_verified: true,
      facts_status: "extracted" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(true);
    expect((res.computed.facts as TerminationFacts).notice_days).toBe(0);
  });

  it("notice backstop: never overrides a non-null model value for notice_days", () => {
    const clause = {
      id: "term-no-override-notice",
      clause_type: "termination" as const,
      verbatim_text: clause92Text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "yes" as const,
        notice_days: 30, // Model explicitly returned 30
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: "immediate effect",
      facts_verified: true,
      facts_status: "extracted" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(false);
    expect((res.computed.facts as TerminationFacts).notice_days).toBe(30);
  });

  it("notice backstop: never sets notice_days when client_convenience_termination is 'no'", () => {
    const clause = {
      id: "term-no-notice-when-no",
      clause_type: "termination" as const,
      verbatim_text: clause92Text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "no" as const,
        notice_days: null,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: null,
      facts_verified: false,
      facts_status: "none" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(false);
    expect((res.computed.facts as TerminationFacts).notice_days).toBeNull();
  });

  it("'The Contractor may terminate for convenience' does NOT trigger backstop", () => {
    const contractorText =
      "The Contractor may terminate for convenience upon thirty (30) days notice.";
    const clause = {
      id: "term-contractor",
      clause_type: "termination" as const,
      verbatim_text: contractorText,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "unspecified" as const,
        notice_days: 30,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: "upon thirty (30) days notice",
      facts_verified: true,
      facts_status: "extracted" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(false);
    expect((res.computed.facts as TerminationFacts).client_convenience_termination).toBe("unspecified");
  });

  it("model value 'no' is not overridden even if text matches", () => {
    const clause = {
      id: "term-override-test",
      clause_type: "termination" as const,
      verbatim_text: clause92Text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "no" as const,
        notice_days: null,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: "immediate effect",
      facts_verified: true,
      facts_status: "extracted" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(false);
    expect((res.computed.facts as TerminationFacts).client_convenience_termination).toBe("no");
  });

  it("model value 'yes' is not overridden", () => {
    const clause = {
      id: "term-yes-test",
      clause_type: "termination" as const,
      verbatim_text: clause92Text,
      char_start: 0,
    };
    const current = {
      facts: {
        client_convenience_termination: "yes" as const,
        notice_days: 0,
        payment_for_work_done: "unspecified" as const,
        handover_required: "unspecified" as const,
      },
      facts_evidence: "immediate effect",
      facts_verified: true,
      facts_status: "extracted" as const,
    };

    const res = applyLexicalBackstop(clause, current);
    expect(res.applied).toBe(false);
    expect((res.computed.facts as TerminationFacts).client_convenience_termination).toBe("yes");
  });
});

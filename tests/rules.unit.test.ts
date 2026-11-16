import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYBOOK, type PlaybookPreferences } from "@/lib/playbook/schema";
import { aggregateClauseFacts } from "@/lib/risk/aggregate";
import { evaluateRiskRules } from "@/lib/risk/engine";
import { formatFindingText } from "@/lib/risk/templates";
import {
  type ClauseWithFacts,
  type Finding,
  REGISTERED_RULE_IDS,
} from "@/lib/risk/types";
import {
  balancedContractClauses,
  riskyContractClauses,
} from "./fixtures/fact-fixtures";

function createClause(partial: Partial<ClauseWithFacts>): ClauseWithFacts {
  return {
    id: "test-clause-1",
    document_id: "test-doc-1",
    run_id: "test-run-1",
    clause_type: "payment",
    verbatim_text: "Payment text here.",
    page_number: 1,
    char_start: 0,
    char_end: 18,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {},
    facts_evidence: "Payment text here.",
    facts_verified: true,
    facts_prompt_version: "v1",
    ...partial,
  };
}

describe("Clause Facts Aggregator", () => {
  it("aggregates single distinct value for string field", () => {
    const clauses: ClauseWithFacts[] = [
      createClause({
        id: "c1",
        clause_type: "payment",
        facts: { payment_trigger: "acceptance" },
      }),
    ];
    const agg = aggregateClauseFacts(clauses);
    expect(agg.payment.payment_trigger.state).toBe("single");
    if (agg.payment.payment_trigger.state === "single") {
      expect(agg.payment.payment_trigger.value).toBe("acceptance");
      expect(agg.payment.payment_trigger.clauses).toHaveLength(1);
    }
  });

  it("aggregates multiple identical values as single", () => {
    const clauses: ClauseWithFacts[] = [
      createClause({
        id: "c1",
        clause_type: "payment",
        facts: { days_to_pay: 30 },
      }),
      createClause({
        id: "c2",
        clause_type: "payment",
        facts: { days_to_pay: 30 },
      }),
    ];
    const agg = aggregateClauseFacts(clauses);
    expect(agg.payment.days_to_pay.state).toBe("single");
    if (agg.payment.days_to_pay.state === "single") {
      expect(agg.payment.days_to_pay.value).toBe(30);
      expect(agg.payment.days_to_pay.clauses).toHaveLength(2);
    }
  });

  it("aggregates conflicting distinct values", () => {
    const clauses: ClauseWithFacts[] = [
      createClause({
        id: "c1",
        clause_type: "payment",
        facts: { days_to_pay: 30 },
      }),
      createClause({
        id: "c2",
        clause_type: "payment",
        facts: { days_to_pay: 60 },
      }),
    ];
    const agg = aggregateClauseFacts(clauses);
    expect(agg.payment.days_to_pay.state).toBe("conflicting");
    if (agg.payment.days_to_pay.state === "conflicting") {
      expect(agg.payment.days_to_pay.values).toEqual([30, 60]);
      expect(agg.payment.days_to_pay.clauses).toHaveLength(2);
    }
  });

  it("handles unspecified when all clauses have unspecified or null", () => {
    const clauses: ClauseWithFacts[] = [
      createClause({
        id: "c1",
        clause_type: "payment",
        facts: { days_to_pay: null, payment_trigger: "unspecified" },
      }),
    ];
    const agg = aggregateClauseFacts(clauses);
    expect(agg.payment.days_to_pay.state).toBe("unspecified");
    expect(agg.payment.payment_trigger.state).toBe("unspecified");
  });
});

describe("Deterministic Risk Rules Boundaries", () => {
  const basePlaybook: PlaybookPreferences = { ...DEFAULT_PLAYBOOK };

  describe("PAY-1: Payment deadline exceeds playbook limit", () => {
    it("does not fire when days_to_pay <= max_days_to_pay", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { days_to_pay: 30 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        payment_terms: { ...basePlaybook.payment_terms, max_days_to_pay: 30 },
      });
      const pay1 = findings.find((f) => f.rule_id === "PAY-1");
      expect(pay1).toBeUndefined();
    });

    it("fires medium when days_to_pay > max_days_to_pay but < 2x", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { days_to_pay: 31 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        payment_terms: { ...basePlaybook.payment_terms, max_days_to_pay: 30 },
      });
      const pay1 = findings.find((f) => f.rule_id === "PAY-1");
      expect(pay1).toBeDefined();
      expect(pay1?.severity).toBe("medium");
      expect(pay1?.params.days_to_pay).toBe(31);
      expect(pay1?.params.diff).toBe(1);
    });

    it("fires high when days_to_pay >= 2x max_days_to_pay", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { days_to_pay: 60, total_fee_amount: 5000, currency: "USD", payment_trigger: "acceptance" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        payment_terms: { ...basePlaybook.payment_terms, max_days_to_pay: 30 },
      });
      const pay1 = findings.find((f) => f.rule_id === "PAY-1");
      expect(pay1).toBeDefined();
      expect(pay1?.severity).toBe("high");
      expect(pay1?.priority).toBe(60);
      expect(pay1?.params.amount).toBe(5000);
      expect(pay1?.params.currency).toBe("USD");
      expect(pay1?.params.clock_starts_at).toBe("acceptance");
    });
  });

  describe("PAY-2: Acceptance trigger or client withholding", () => {
    it("fires medium when payment_trigger is acceptance", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { payment_trigger: "acceptance", days_to_pay: 15 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const pay2 = findings.find((f) => f.rule_id === "PAY-2");
      expect(pay2).toBeDefined();
      expect(pay2?.severity).toBe("medium");
    });

    it("fires medium when client_may_withhold is for_unaccepted_work", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { client_may_withhold: "for_unaccepted_work", days_to_pay: 15 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const pay2 = findings.find((f) => f.rule_id === "PAY-2");
      expect(pay2).toBeDefined();
      expect(pay2?.severity).toBe("medium");
    });

    it("does not fire when client_may_withhold is disputed_portion_only (boundary test)", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { payment_trigger: "invoice_receipt", client_may_withhold: "disputed_portion_only", days_to_pay: 15 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const pay2 = findings.find((f) => f.rule_id === "PAY-2");
      expect(pay2).toBeUndefined();
    });

    it("does not fire when invoice_receipt and withholding is no", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { payment_trigger: "invoice_receipt", client_may_withhold: "no", days_to_pay: 15 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const pay2 = findings.find((f) => f.rule_id === "PAY-2");
      expect(pay2).toBeUndefined();
    });
  });

  describe("PAY-3: Missing payment clause or unspecified timeline", () => {
    it("fires low with lawyer review when no payment clause exists", () => {
      const clauses: ClauseWithFacts[] = [];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const pay3 = findings.find((f) => f.rule_id === "PAY-3");
      expect(pay3).toBeDefined();
      expect(pay3?.severity).toBe("low");
      expect(pay3?.lawyer_review).toBe(true);
      expect(pay3?.lawyer_review_reasons).toContain("no_payment_clause");
    });

    it("fires low with lawyer review when days_to_pay is unspecified", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { days_to_pay: null },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const pay3 = findings.find((f) => f.rule_id === "PAY-3");
      expect(pay3).toBeDefined();
      expect(pay3?.severity).toBe("low");
      expect(pay3?.lawyer_review).toBe(true);
    });

    it("does not fire when days_to_pay is specified", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "payment",
          facts: { days_to_pay: 15 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const pay3 = findings.find((f) => f.rule_id === "PAY-3");
      expect(pay3).toBeUndefined();
    });
  });

  describe("LIAB-1: Liability cap requirements", () => {
    it("fires high when require_cap is true and liability is unlimited", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "liability",
          facts: { contractor_liability: "unlimited" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        liability_cap: { require_cap: true, max_multiple_of_fees: 1.0 },
      });
      const liab1 = findings.find((f) => f.rule_id === "LIAB-1");
      expect(liab1).toBeDefined();
      expect(liab1?.severity).toBe("high");
    });

    it("fires medium when cap multiple exceeds playbook", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "liability",
          facts: { contractor_liability: "capped", cap_multiple_of_fees: 2.0 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        liability_cap: { require_cap: true, max_multiple_of_fees: 1.0 },
      });
      const liab1 = findings.find((f) => f.rule_id === "LIAB-1");
      expect(liab1).toBeDefined();
      expect(liab1?.severity).toBe("medium");
      expect(liab1?.params.cap_multiple_of_fees).toBe(2.0);
    });

    it("does not fire when capped within playbook multiple", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "liability",
          facts: { contractor_liability: "capped", cap_multiple_of_fees: 1.0 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        liability_cap: { require_cap: true, max_multiple_of_fees: 1.0 },
      });
      const liab1 = findings.find((f) => f.rule_id === "LIAB-1");
      expect(liab1).toBeUndefined();
    });

    it("fires medium + lawyer review when require_cap is true but liability clause is missing", () => {
      const clauses: ClauseWithFacts[] = [];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        liability_cap: { require_cap: true, max_multiple_of_fees: 1.0 },
      });
      const liab1 = findings.find((f) => f.rule_id === "LIAB-1");
      expect(liab1).toBeDefined();
      expect(liab1?.severity).toBe("medium");
      expect(liab1?.lawyer_review).toBe(true);
    });

    it("does not fire at all when require_cap is false", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "liability",
          facts: { contractor_liability: "unlimited" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        liability_cap: { require_cap: false, max_multiple_of_fees: 1.0 },
      });
      const liab1 = findings.find((f) => f.rule_id === "LIAB-1");
      expect(liab1).toBeUndefined();
    });
  });

  describe("IP-1: IP transfer timing vs playbook", () => {
    it("under transfer_after_full_payment: fires high for on_creation and medium for on_delivery", () => {
      const cCreation: ClauseWithFacts[] = [
        createClause({
          clause_type: "ip_ownership",
          facts: { transfer_timing: "on_creation" },
        }),
      ];
      const fCreation = evaluateRiskRules(cCreation, {
        ...basePlaybook,
        ip_ownership: "transfer_after_full_payment",
      });
      expect(fCreation.find((f) => f.rule_id === "IP-1")?.severity).toBe("high");

      const cDelivery: ClauseWithFacts[] = [
        createClause({
          clause_type: "ip_ownership",
          facts: { transfer_timing: "on_delivery" },
        }),
      ];
      const fDelivery = evaluateRiskRules(cDelivery, {
        ...basePlaybook,
        ip_ownership: "transfer_after_full_payment",
      });
      expect(fDelivery.find((f) => f.rule_id === "IP-1")?.severity).toBe("medium");

      const cPayment: ClauseWithFacts[] = [
        createClause({
          clause_type: "ip_ownership",
          facts: { transfer_timing: "on_full_payment" },
        }),
      ];
      const fPayment = evaluateRiskRules(cPayment, {
        ...basePlaybook,
        ip_ownership: "transfer_after_full_payment",
      });
      expect(fPayment.find((f) => f.rule_id === "IP-1")).toBeUndefined();
    });

    it("conditional_on_payment = no counts like on_creation", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "ip_ownership",
          facts: { transfer_timing: "on_full_payment", conditional_on_payment: "no" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        ip_ownership: "transfer_after_full_payment",
      });
      expect(findings.find((f) => f.rule_id === "IP-1")?.severity).toBe("high");
    });

    it("under license_only: fires high for any transfer", () => {
      for (const timing of ["on_creation", "on_delivery", "on_full_payment"] as const) {
        const clauses: ClauseWithFacts[] = [
          createClause({
            clause_type: "ip_ownership",
            facts: { transfer_timing: timing },
          }),
        ];
        const findings = evaluateRiskRules(clauses, {
          ...basePlaybook,
          ip_ownership: "license_only",
        });
        expect(findings.find((f) => f.rule_id === "IP-1")?.severity).toBe("high");
      }

      const clausesLicense: ClauseWithFacts[] = [
        createClause({
          clause_type: "ip_ownership",
          facts: { transfer_timing: "license_only" },
        }),
      ];
      const findingsLicense = evaluateRiskRules(clausesLicense, {
        ...basePlaybook,
        ip_ownership: "license_only",
      });
      expect(findingsLicense.find((f) => f.rule_id === "IP-1")).toBeUndefined();
    });

    it("under transfer_on_delivery: fires low for on_creation", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "ip_ownership",
          facts: { transfer_timing: "on_creation" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        ip_ownership: "transfer_on_delivery",
      });
      expect(findings.find((f) => f.rule_id === "IP-1")?.severity).toBe("low");
    });

    it("under no_requirement: produces no finding", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "ip_ownership",
          facts: { transfer_timing: "on_creation" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        ip_ownership: "no_requirement",
      });
      expect(findings.find((f) => f.rule_id === "IP-1")).toBeUndefined();
    });
  });

  describe("TERM-1: Convenience termination notice period", () => {
    it("fires high when notice_days = 0", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "termination",
          facts: { client_convenience_termination: "yes", notice_days: 0 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        termination: { ...basePlaybook.termination, min_notice_days: 30 },
      });
      const term1 = findings.find((f) => f.rule_id === "TERM-1");
      expect(term1).toBeDefined();
      expect(term1?.severity).toBe("high");
    });

    it("fires medium when notice_days < min_notice_days (notice_days > 0)", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "termination",
          facts: { client_convenience_termination: "yes", notice_days: 14 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        termination: { ...basePlaybook.termination, min_notice_days: 30 },
      });
      const term1 = findings.find((f) => f.rule_id === "TERM-1");
      expect(term1).toBeDefined();
      expect(term1?.severity).toBe("medium");
      expect(term1?.params.diff).toBe(16);
    });

    it("does not fire when notice_days >= min_notice_days", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "termination",
          facts: { client_convenience_termination: "yes", notice_days: 30 },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        termination: { ...basePlaybook.termination, min_notice_days: 30 },
      });
      expect(findings.find((f) => f.rule_id === "TERM-1")).toBeUndefined();
    });
  });

  describe("TERM-2: Payment for work completed upon termination", () => {
    it("fires high when payment_for_work_done is none", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "termination",
          facts: { payment_for_work_done: "none" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        termination: { ...basePlaybook.termination, pay_for_work_done: true },
      });
      const term2 = findings.find((f) => f.rule_id === "TERM-2");
      expect(term2).toBeDefined();
      expect(term2?.severity).toBe("high");
    });

    it("fires medium when payment_for_work_done is only_invoiced", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "termination",
          facts: { payment_for_work_done: "only_invoiced" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        termination: { ...basePlaybook.termination, pay_for_work_done: true },
      });
      const term2 = findings.find((f) => f.rule_id === "TERM-2");
      expect(term2).toBeDefined();
      expect(term2?.severity).toBe("medium");
    });

    it("does not fire when payment_for_work_done is full", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "termination",
          facts: { payment_for_work_done: "full" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        termination: { ...basePlaybook.termination, pay_for_work_done: true },
      });
      expect(findings.find((f) => f.rule_id === "TERM-2")).toBeUndefined();
    });

    it("does not fire when pay_for_work_done is false in playbook", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "termination",
          facts: { payment_for_work_done: "none" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        termination: { ...basePlaybook.termination, pay_for_work_done: false },
      });
      expect(findings.find((f) => f.rule_id === "TERM-2")).toBeUndefined();
    });
  });

  describe("SCOPE-1: Written change orders", () => {
    it("fires high when both written_change_order_required = no AND extra_work_without_additional_fee = yes", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "scope_change",
          facts: { written_change_order_required: "no", extra_work_without_additional_fee: "yes" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        scope_changes: { require_written_change_order: true },
      });
      const scope1 = findings.find((f) => f.rule_id === "SCOPE-1");
      expect(scope1).toBeDefined();
      expect(scope1?.severity).toBe("high");
    });

    it("fires medium when only written_change_order_required = no", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "scope_change",
          facts: { written_change_order_required: "no", extra_work_without_additional_fee: "no" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        scope_changes: { require_written_change_order: true },
      });
      const scope1 = findings.find((f) => f.rule_id === "SCOPE-1");
      expect(scope1).toBeDefined();
      expect(scope1?.severity).toBe("medium");
    });

    it("does not fire when written orders required and no free work", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "scope_change",
          facts: { written_change_order_required: "yes", extra_work_without_additional_fee: "no" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, {
        ...basePlaybook,
        scope_changes: { require_written_change_order: true },
      });
      expect(findings.find((f) => f.rule_id === "SCOPE-1")).toBeUndefined();
    });
  });

  describe("LAW-1: Foreign governing law", () => {
    it("fires medium with lawyer review when foreign_to_bangladesh is yes", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "governing_law",
          facts: {
            foreign_to_bangladesh: "yes",
            governing_law_name: "Delaware, USA",
            dispute_forum: "arbitration",
            seat: "Singapore",
          },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const law1 = findings.find((f) => f.rule_id === "LAW-1");
      expect(law1).toBeDefined();
      expect(law1?.severity).toBe("medium");
      expect(law1?.lawyer_review).toBe(true);
      expect(law1?.params.arbitration_foreign_seat).toBe(true);
      expect(law1?.params.seat).toBe("Singapore");
    });

    it("does not fire when foreign_to_bangladesh is no", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "governing_law",
          facts: { foreign_to_bangladesh: "no" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      expect(findings.find((f) => f.rule_id === "LAW-1")).toBeUndefined();
    });
  });

  describe("IND-1: Contractor broad indemnity", () => {
    it("fires high when contractor and broad", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "indemnity",
          facts: { indemnifying_party: "contractor", scope: "broad" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const ind1 = findings.find((f) => f.rule_id === "IND-1");
      expect(ind1).toBeDefined();
      expect(ind1?.severity).toBe("high");
    });

    it("does not fire when mutual or limited", () => {
      const clausesMutual: ClauseWithFacts[] = [
        createClause({
          clause_type: "indemnity",
          facts: { indemnifying_party: "mutual", scope: "broad" },
        }),
      ];
      expect(evaluateRiskRules(clausesMutual, basePlaybook).find((f) => f.rule_id === "IND-1")).toBeUndefined();

      const clausesLimited: ClauseWithFacts[] = [
        createClause({
          clause_type: "indemnity",
          facts: { indemnifying_party: "contractor", scope: "limited" },
        }),
      ];
      expect(evaluateRiskRules(clausesLimited, basePlaybook).find((f) => f.rule_id === "IND-1")).toBeUndefined();
    });
  });

  describe("DEF-1: Consequential loss definition", () => {
    it("fires medium when includes_indirect_or_consequential_losses is yes", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "definition",
          facts: { includes_indirect_or_consequential_losses: "yes", defined_term: "Losses" },
        }),
      ];
      const findings = evaluateRiskRules(clauses, basePlaybook);
      const def1 = findings.find((f) => f.rule_id === "DEF-1");
      expect(def1).toBeDefined();
      expect(def1?.severity).toBe("medium");
      expect(def1?.params.defined_term).toBe("Losses");
    });

    it("does not fire when includes_indirect_or_consequential_losses is no", () => {
      const clauses: ClauseWithFacts[] = [
        createClause({
          clause_type: "definition",
          facts: { includes_indirect_or_consequential_losses: "no" },
        }),
      ];
      expect(evaluateRiskRules(clauses, basePlaybook).find((f) => f.rule_id === "DEF-1")).toBeUndefined();
    });
  });
});

describe("Lawyer Review Triggers", () => {
  it("triggers lawyer review when facts are conflicting", () => {
    const clauses: ClauseWithFacts[] = [
      createClause({
        id: "c1",
        clause_type: "payment",
        facts: { days_to_pay: 45 },
      }),
      createClause({
        id: "c2",
        clause_type: "payment",
        facts: { days_to_pay: 60 },
      }),
    ];
    const findings = evaluateRiskRules(clauses, {
      ...DEFAULT_PLAYBOOK,
      payment_terms: { ...DEFAULT_PLAYBOOK.payment_terms, max_days_to_pay: 30 },
    });
    const pay1 = findings.find((f) => f.rule_id === "PAY-1");
    expect(pay1?.lawyer_review).toBe(true);
    expect(pay1?.lawyer_review_reasons).toContain("conflicting_facts");
  });

  it("triggers lawyer review when extraction confidence is low", () => {
    const clauses: ClauseWithFacts[] = [
      createClause({
        clause_type: "payment",
        extraction_confidence: "low",
        facts: { days_to_pay: 45 },
      }),
    ];
    const findings = evaluateRiskRules(clauses, {
      ...DEFAULT_PLAYBOOK,
      payment_terms: { ...DEFAULT_PLAYBOOK.payment_terms, max_days_to_pay: 30 },
    });
    const pay1 = findings.find((f) => f.rule_id === "PAY-1");
    expect(pay1?.lawyer_review).toBe(true);
    expect(pay1?.lawyer_review_reasons).toContain("low_model_confidence");
  });

  it("triggers lawyer review when clause facts were dropped (facts_status = 'failed')", () => {
    const clauses: ClauseWithFacts[] = [
      createClause({
        clause_type: "payment",
        facts_verified: false,
        facts_status: "failed",
        facts: { days_to_pay: 45 },
      }),
    ];
    const findings = evaluateRiskRules(clauses, {
      ...DEFAULT_PLAYBOOK,
      payment_terms: { ...DEFAULT_PLAYBOOK.payment_terms, max_days_to_pay: 30 },
    });
    const pay1 = findings.find((f) => f.rule_id === "PAY-1");
    expect(pay1?.lawyer_review).toBe(true);
    expect(pay1?.lawyer_review_reasons).toContain("facts_dropped");
  });

  it("does NOT trigger facts_dropped when clause has facts_status = 'none'", () => {
    const clauses: ClauseWithFacts[] = [
      createClause({
        clause_type: "payment",
        facts_verified: false,
        facts_status: "none",
        facts: { days_to_pay: 45 },
      }),
    ];
    const findings = evaluateRiskRules(clauses, {
      ...DEFAULT_PLAYBOOK,
      payment_terms: { ...DEFAULT_PLAYBOOK.payment_terms, max_days_to_pay: 30 },
    });
    const pay1 = findings.find((f) => f.rule_id === "PAY-1");
    expect(pay1?.lawyer_review_reasons).not.toContain("facts_dropped");
  });

  it("R1: IP-1 with conflicting transfer_timing computes highest severity, conflicting_facts review reason, and identical finding when clause order is reversed", () => {
    const clauseCreation = createClause({
      id: "11111111-1111-4111-8111-111111111111",
      clause_type: "ip_ownership",
      page_number: 1,
      char_start: 10,
      char_end: 50,
      verbatim_text: "Ownership of all IP transfers upon creation immediately.",
      facts_verified: true,
      facts_status: "extracted",
      facts_evidence: "transfers upon creation",
      facts: { transfer_timing: "on_creation", conditional_on_payment: "unspecified" },
    });

    const clauseDelivery = createClause({
      id: "22222222-2222-4222-8222-222222222222",
      clause_type: "ip_ownership",
      page_number: 2,
      char_start: 100,
      char_end: 150,
      verbatim_text: "IP rights transfer upon delivery of final deliverables.",
      facts_verified: true,
      facts_status: "extracted",
      facts_evidence: "transfer upon delivery",
      facts: { transfer_timing: "on_delivery", conditional_on_payment: "unspecified" },
    });

    const playbook = {
      ...DEFAULT_PLAYBOOK,
      ip_ownership: "transfer_after_full_payment" as const,
    };

    const findingsOrder1 = evaluateRiskRules([clauseCreation, clauseDelivery], playbook);
    const findingsOrder2 = evaluateRiskRules([clauseDelivery, clauseCreation], playbook);

    const ip1Order1 = findingsOrder1.find((f) => f.rule_id === "IP-1");
    const ip1Order2 = findingsOrder2.find((f) => f.rule_id === "IP-1");

    expect(ip1Order1).toBeDefined();
    expect(ip1Order2).toBeDefined();

    expect(ip1Order1?.severity).toBe("high");
    expect(ip1Order2?.severity).toBe("high");

    expect(ip1Order1?.lawyer_review_reasons).toContain("conflicting_facts");
    expect(ip1Order2?.lawyer_review_reasons).toContain("conflicting_facts");

    expect(ip1Order1?.clause_ids).toEqual([clauseCreation.id, clauseDelivery.id]);
    expect(ip1Order1?.evidence).toHaveLength(2);

    expect(ip1Order1).toEqual(ip1Order2);
  });

  it("R2: PAY-1 does not mutate aggregation arrays and leaves aggregated state unchanged", () => {
    const feeClause = createClause({
      id: "33333333-3333-4333-8333-333333333333",
      clause_type: "payment",
      page_number: 1,
      char_start: 0,
      char_end: 40,
      verbatim_text: "Total fee for services is 5000 USD.",
      facts_verified: true,
      facts_status: "extracted",
      facts: { total_fee_amount: 5000, currency: "USD", days_to_pay: null },
    });

    const paymentClause = createClause({
      id: "44444444-4444-4444-8444-444444444444",
      clause_type: "payment",
      page_number: 2,
      char_start: 50,
      char_end: 100,
      verbatim_text: "Payment is due within 60 calendar days of invoice.",
      facts_verified: true,
      facts_status: "extracted",
      facts: { total_fee_amount: null, days_to_pay: 60, payment_trigger: "invoice_receipt" },
    });

    const clauses = [feeClause, paymentClause];
    const initialAggregated = aggregateClauseFacts(clauses);
    const deepCopyBefore = structuredClone(initialAggregated);

    const findings = evaluateRiskRules(clauses, DEFAULT_PLAYBOOK);
    expect(findings.some((f) => f.rule_id === "PAY-1")).toBe(true);

    const aggregatedAfter = aggregateClauseFacts(clauses);
    expect(aggregatedAfter).toEqual(deepCopyBefore);
    expect(initialAggregated.payment.days_to_pay.clauses).toHaveLength(1);
    expect(initialAggregated.payment.days_to_pay.clauses[0].id).toBe(paymentClause.id);
  });
});

describe("Template Renderer (formatFindingText)", () => {
  it("formats text across all registered rules for English and Bangla", () => {
    const locales = ["en", "bn"] as const;

    for (const ruleId of REGISTERED_RULE_IDS) {
      for (const locale of locales) {
        const mockFinding: Finding = {
          rule_id: ruleId,
          rule_version: "v1",
          source: "builtin",
          severity: "high",
          priority: 60,
          clause_ids: ["test-clause-1"],
          evidence: [
            {
              clause_id: "test-clause-1",
              page_number: 1,
              char_start: 0,
              char_end: 18,
              quote: "Payment text here.",
            },
          ],
          params: {
            days_to_pay: 45,
            playbook_max_days: 30,
            amount: 5000,
            currency: "USD",
            clock_starts_at: "acceptance",
            transfer_timing: "on_creation",
            playbook_preference: "transfer_after_full_payment",
            min_notice_days: 30,
            notice_days: 0,
            payment_for_work_done: "none",
            governing_law_name: "Delaware",
            defined_term: "Losses",
          },
          lawyer_review: false,
          lawyer_review_reasons: [],
        };

        const formatted = formatFindingText(mockFinding, locale);
        expect(formatted.title).toBeTruthy();
        expect(formatted.vsLine).toBeTruthy();
        expect(formatted.reason).toBeTruthy();
        expect(formatted.recommendation).toBeTruthy();
        expect(typeof formatted.title).toBe("string");
        expect(typeof formatted.vsLine).toBe("string");
      }
    }
  });

  it("safely falls back without crashing when parameters are missing", () => {
    const mockFinding: Finding = {
      rule_id: "PAY-1",
      rule_version: "v1",
      source: "playbook",
      severity: "high",
      priority: 60,
      clause_ids: [],
      evidence: [],
      params: {}, // completely empty params
      lawyer_review: false,
      lawyer_review_reasons: [],
    };

    const formattedEn = formatFindingText(mockFinding, "en");
    expect(formattedEn.title).toBeTruthy();
    expect(formattedEn.vsLine).toBeTruthy();

    const formattedBn = formatFindingText(mockFinding, "bn");
    expect(formattedBn.title).toBeTruthy();
    expect(formattedBn.vsLine).toBeTruthy();
  });
});

describe("Documentation Coverage (docs/RULES.md)", () => {
  it("fails if any registered rule id is missing from docs/RULES.md", () => {
    const rulesPath = path.resolve(process.cwd(), "docs/RULES.md");
    expect(fs.existsSync(rulesPath)).toBe(true);

    const docContent = fs.readFileSync(rulesPath, "utf-8");

    for (const ruleId of REGISTERED_RULE_IDS) {
      const match = docContent.includes(`\`${ruleId}\``) || docContent.includes(ruleId);
      expect(
        match,
        `Rule ${ruleId} is registered in code but missing from docs/RULES.md`,
      ).toBe(true);
    }
  });
});

describe("Fixture Evaluation: riskyContractClauses & balancedContractClauses", () => {
  it("fires exactly 10 rules on riskyContractClauses", () => {
    const findings = evaluateRiskRules(riskyContractClauses, DEFAULT_PLAYBOOK);
    const triggeredRules = findings.map((f) => f.rule_id);

    const expectedRules = [
      "PAY-1",
      "PAY-2",
      "LIAB-1",
      "IP-1",
      "TERM-1",
      "TERM-2",
      "SCOPE-1",
      "LAW-1",
      "IND-1",
      "DEF-1",
    ];

    for (const rule of expectedRules) {
      expect(
        triggeredRules,
        `Expected risky contract to trigger ${rule}`,
      ).toContain(rule);
    }
    expect(findings.length).toBe(10);
  });

  it("fires exactly ZERO findings on balancedContractClauses under DEFAULT_PLAYBOOK", () => {
    const findings = evaluateRiskRules(balancedContractClauses, DEFAULT_PLAYBOOK);
    expect(findings).toEqual([]);
    expect(findings.length).toBe(0);
  });

  describe("Evidence trimming (F3)", () => {
    it("risky fixture IP finding has exactly the on-creation clause evidence", () => {
      const findings = evaluateRiskRules(riskyContractClauses, DEFAULT_PLAYBOOK);
      const ipFinding = findings.find((f) => f.rule_id === "IP-1");
      expect(ipFinding).toBeDefined();
      expect(ipFinding?.evidence).toHaveLength(1);
      expect(ipFinding?.evidence[0].clause_id).toBe("33333333-3333-4333-8333-333333333333");
      expect(ipFinding?.evidence[0].quote).toContain("rights in deliverables shall vest in Client immediately upon creation");
    });

    it("termination finding has the convenience-termination clause and the payment-for-work clause only", () => {
      const convClause = createClause({
        id: "term-conv-1",
        clause_type: "termination",
        verbatim_text: "Client may terminate this Agreement at any time for convenience upon written notice.",
        facts_evidence: "terminate this Agreement at any time for convenience",
        facts: { client_convenience_termination: "yes", notice_days: 30 },
      });
      const payClause = createClause({
        id: "term-pay-2",
        clause_type: "termination",
        verbatim_text: "In the event of termination, no payment shall be made for work completed prior to notice.",
        facts_evidence: "no payment shall be made for work completed prior to notice",
        facts: { payment_for_work_done: "none" },
      });
      const handoverClause = createClause({
        id: "term-handover-3",
        clause_type: "termination",
        verbatim_text: "Contractor shall promptly return all client confidential materials upon termination.",
        facts_evidence: "return all client confidential materials upon termination",
        facts: { handover_required: "yes" },
      });

      const findings = evaluateRiskRules([convClause, payClause, handoverClause], DEFAULT_PLAYBOOK);
      const term2 = findings.find((f) => f.rule_id === "TERM-2");
      expect(term2).toBeDefined();
      expect(term2?.clause_ids).toEqual(["term-conv-1", "term-pay-2"]);
      expect(term2?.evidence).toHaveLength(2);
      const evClauseIds = term2?.evidence.map((e) => e.clause_id);
      expect(evClauseIds).toContain("term-conv-1");
      expect(evClauseIds).toContain("term-pay-2");
      expect(evClauseIds).not.toContain("term-handover-3");
    });

    it("PAY-1 includes the fee clause when consequence sentence with fee is shown", () => {
      const daysClause = createClause({
        id: "pay-days-1",
        clause_type: "payment",
        page_number: 1,
        verbatim_text: "Invoices shall be paid within sixty (60) days of receipt.",
        facts_evidence: "paid within sixty (60) days of receipt",
        facts: { days_to_pay: 60, payment_trigger: "invoice_receipt" },
      });
      const feeClause = createClause({
        id: "pay-fee-2",
        clause_type: "payment",
        page_number: 2,
        verbatim_text: "The total fee for all services shall be 5,000 USD payable as scheduled.",
        facts_evidence: "total fee for all services shall be 5,000 USD",
        facts: { total_fee_amount: 5000, currency: "USD" },
      });

      const findings = evaluateRiskRules([daysClause, feeClause], DEFAULT_PLAYBOOK);
      const pay1 = findings.find((f) => f.rule_id === "PAY-1");
      expect(pay1).toBeDefined();
      expect(pay1?.params.amount).toBe(5000);
      expect(pay1?.clause_ids).toContain("pay-days-1");
      expect(pay1?.clause_ids).toContain("pay-fee-2");
      const evClauseIds = pay1?.evidence.map((e) => e.clause_id);
      expect(evClauseIds).toContain("pay-days-1");
      expect(evClauseIds).toContain("pay-fee-2");
    });
  });
});

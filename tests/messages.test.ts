import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FindingsPane } from "@/components/FindingsPane";
import {
  CLIENT_MAY_WITHHOLD,
  CONTRACTOR_LIABILITY,
  DISPUTE_FORUM,
  INDEMNIFYING_PARTY,
  INDEMNITY_SCOPE,
  PAYMENT_FOR_WORK_DONE,
  PAYMENT_TRIGGERS,
  TRANSFER_TIMING,
  YES_NO_UNSPECIFIED,
} from "@/lib/facts/types";
import bn from "@/lib/i18n/bn.json";
import en from "@/lib/i18n/en.json";
import type { Messages } from "@/lib/i18n";
import { DEFAULT_PLAYBOOK, type PlaybookPreferences } from "@/lib/playbook/schema";
import { evaluateRiskRules, type Finding, type ClauseWithFacts } from "@/lib/risk";
import type { FindingRow } from "@/lib/supabase/types";
import {
  getExtractionErrorMessage,
  getPlaybookFieldErrorMessage,
  getUploadErrorMessage,
} from "@/lib/ui/messages";
import { balancedContractClauses, riskyContractClauses } from "./fixtures/fact-fixtures";

describe("F1 upload error messages", () => {
  it("returns exact expected English copy for all known error codes", () => {
    expect(getUploadErrorMessage("not_pdf", "en")).toBe(
      "This file isn't a PDF. Please upload a PDF contract.",
    );
    expect(getUploadErrorMessage("too_large", "en")).toBe(
      "This file is larger than 10 MB. Please upload a smaller PDF.",
    );
    expect(getUploadErrorMessage("too_many_pages", "en")).toBe(
      "This PDF has more than 80 pages. Please upload a shorter document.",
    );
    expect(getUploadErrorMessage("encrypted", "en")).toBe(
      "This PDF is password-protected. Remove the password and upload it again.",
    );
    expect(getUploadErrorMessage("corrupt", "en")).toBe(
      "We couldn't read this PDF. The file may be damaged.",
    );
    expect(getUploadErrorMessage("scanned_unsupported", "en")).toBe(
      "This PDF looks like a scan or an image, so there is no text to read. Only text-based PDFs are supported for now.",
    );
    expect(getUploadErrorMessage("network_error", "en")).toBe(
      "Upload failed. Check your connection and try again.",
    );
    expect(getUploadErrorMessage("timeout", "en")).toBe(
      "The upload took too long. Please try again.",
    );

    const genericCodes = [
      "invalid_request",
      "missing_file",
      "storage_error",
      "database_error",
      "service_unavailable",
      "internal_error",
      "not_found",
      "invalid_id",
      "unknown",
    ];

    for (const code of genericCodes) {
      expect(getUploadErrorMessage(code, "en")).toBe(
        "Something went wrong on our side. Please try again.",
      );
    }
  });

  it("returns localized Bangla copy for known error codes without technical jargon", () => {
    expect(getUploadErrorMessage("not_pdf", "bn")).toContain("PDF");
    expect(getUploadErrorMessage("not_pdf", "bn")).not.toContain("%PDF-");
    expect(getUploadErrorMessage("scanned_unsupported", "bn")).not.toContain("OCR");
    expect(getUploadErrorMessage("network_error", "bn")).toContain("ইন্টারনেট");
    expect(getUploadErrorMessage("timeout", "bn")).toContain("সময়");
    expect(getUploadErrorMessage("too_large", "bn")).toContain("১০ মেগাবাইট");
  });

  it("falls back to generic message for unknown, null, or undefined codes in both locales", () => {
    expect(getUploadErrorMessage("non_existent_code", "en")).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(getUploadErrorMessage("non_existent_code", "bn")).toBe(
      "আমাদের সিস্টেমে কোনো সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
    );
    expect(getUploadErrorMessage(null, "en")).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(getUploadErrorMessage(undefined, "bn")).toBe(
      "আমাদের সিস্টেমে কোনো সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
    );
  });
});

describe("F2 playbook field error messages", () => {
  it("returns exact expected English copy for specific playbook field keys", () => {
    expect(
      getPlaybookFieldErrorMessage("liability_cap.max_multiple_of_fees", "en"),
    ).toBe("Enter a number from 0.5 to 10.");
    expect(
      getPlaybookFieldErrorMessage("payment_terms.max_days_to_pay", "en"),
    ).toBe("Enter a whole number from 1 to 120.");
    expect(
      getPlaybookFieldErrorMessage("termination.min_notice_days", "en"),
    ).toBe("Enter a whole number from 0 to 90.");
    expect(getPlaybookFieldErrorMessage("ip_ownership", "en")).toBe(
      "Choose one of the options.",
    );
  });

  it("returns natural Bangla copy for specific playbook field keys", () => {
    expect(
      getPlaybookFieldErrorMessage("liability_cap.max_multiple_of_fees", "bn"),
    ).toBe("০.৫ থেকে ১০-এর মধ্যে একটি সংখ্যা লিখুন।");
    expect(
      getPlaybookFieldErrorMessage("payment_terms.max_days_to_pay", "bn"),
    ).toBe("১ থেকে ১২০-এর মধ্যে একটি পূর্ণসংখ্যা লিখুন।");
    expect(
      getPlaybookFieldErrorMessage("termination.min_notice_days", "bn"),
    ).toBe("০ থেকে ৯০-এর মধ্যে একটি পূর্ণসংখ্যা লিখুন।");
    expect(getPlaybookFieldErrorMessage("ip_ownership", "bn")).toBe(
      "যেকোনো একটি বিকল্প বেছে নিন।",
    );
  });

  it("returns fallback message for any other field or unknown paths in both locales", () => {
    expect(
      getPlaybookFieldErrorMessage("termination.pay_for_work_done", "en"),
    ).toBe("Check this value.");
    expect(
      getPlaybookFieldErrorMessage("termination.pay_for_work_done", "bn"),
    ).toBe("এই মানটি যাচাই করুন।");
    expect(getPlaybookFieldErrorMessage("arbitrary_unknown_field", "en")).toBe(
      "Check this value.",
    );
    expect(getPlaybookFieldErrorMessage("arbitrary_unknown_field", "bn")).toBe(
      "এই মানটি যাচাই করুন।",
    );
    expect(getPlaybookFieldErrorMessage(null, "en")).toBe("Check this value.");
    expect(getPlaybookFieldErrorMessage(undefined, "bn")).toBe("এই মানটি যাচাই করুন।");
  });
});

describe("F3 extraction error messages", () => {
  it("returns exact expected English copy for all known extraction error codes", () => {
    expect(getExtractionErrorMessage("llm_not_configured", "en")).toBe(
      "The AI service is not configured. Please contact support or check server settings.",
    );
    expect(getExtractionErrorMessage("llm_rate_limited", "en")).toBe(
      "The AI service is currently busy. Please wait a moment and try again.",
    );
    expect(getExtractionErrorMessage("llm_unavailable", "en")).toBe(
      "The AI service is temporarily unavailable. Please try again shortly.",
    );
    expect(getExtractionErrorMessage("llm_invalid_output", "en")).toBe(
      "We received an unexpected response format from the AI service. Please try again.",
    );
    expect(getExtractionErrorMessage("llm_blocked", "en")).toBe(
      "This document content could not be processed due to safety filter policies.",
    );
    expect(getExtractionErrorMessage("rate_limited_local", "en")).toBe(
      "You've reached the hourly limit for contract extractions. Please try again later.",
    );
    expect(getExtractionErrorMessage("extraction_in_progress", "en")).toBe(
      "An extraction is already in progress for this document. Please wait for it to complete.",
    );

    const genericCodes = [
      "llm_bad_request",
      "invalid_id",
      "not_found",
      "internal_error",
      "network_error",
      "unknown",
    ];
    for (const code of genericCodes) {
      expect(getExtractionErrorMessage(code, "en")).toBe(
        code === "network_error"
          ? "Connection error. Please check your internet connection and try again."
          : "Something went wrong on our side. Please try again.",
      );
    }
  });

  it("returns natural Bangla copy for extraction error codes without technical jargon", () => {
    expect(getExtractionErrorMessage("llm_bad_request", "bn")).toContain("সমস্যা");
    expect(getExtractionErrorMessage("llm_not_configured", "bn")).toContain("কনফিগার");
    expect(getExtractionErrorMessage("llm_rate_limited", "bn")).toContain("ব্যস্ত");
    expect(getExtractionErrorMessage("llm_unavailable", "bn")).toContain("অনুপলব্ধ");
    expect(getExtractionErrorMessage("llm_invalid_output", "bn")).toContain("অপ্রত্যাশিত");
    expect(getExtractionErrorMessage("llm_blocked", "bn")).toContain("নিরাপত্তা");
    expect(getExtractionErrorMessage("rate_limited_local", "bn")).toContain("ঘণ্টার");
    expect(getExtractionErrorMessage("extraction_in_progress", "bn")).toContain("বিশ্লেষণ চলছে");
    expect(getExtractionErrorMessage("network_error", "bn")).toContain("ইন্টারনেট");
  });

  it("falls back to generic unknown message for null, undefined, or unknown codes in both locales", () => {
    expect(getExtractionErrorMessage("unknown_code_xyz", "en")).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(getExtractionErrorMessage("unknown_code_xyz", "bn")).toBe(
      "আমাদের সিস্টেমে কোনো সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
    );
    expect(getExtractionErrorMessage(null, "en")).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(getExtractionErrorMessage(undefined, "bn")).toBe(
      "আমাদের সিস্টেমে কোনো সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
    );
  });
});

describe("F8 dictionary parity check", () => {
  function getSortedKeyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
    const paths: string[] = [];
    for (const key of Object.keys(obj)) {
      const current = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        paths.push(...getSortedKeyPaths(value as Record<string, unknown>, current));
      } else {
        paths.push(current);
      }
    }
    return paths.sort();
  }

  it("en.json and bn.json have identical key sets and removed header.phaseLabel", () => {
    const enKeys = getSortedKeyPaths(en);
    const bnKeys = getSortedKeyPaths(bn);

    expect(enKeys).toEqual(bnKeys);
    expect(enKeys).not.toContain("header.phaseLabel");
    expect(enKeys).toContain("tabs.groupLabel");
    expect(enKeys).toContain("tabs.rightPaneLabel");
    expect(enKeys).toContain("clausesPane.errorCodes.llm_bad_request");
    expect(enKeys).toContain("documentPane.demoNotice");
    expect(enKeys).toContain("playbookPane.loadErrorTitle");
    expect(enKeys).toContain("playbookPane.retryButton");
  });
});

describe("F4: Localized labels and no raw codes on screen", () => {
  it("for every enum value of every fact field, a label exists in both locales", () => {
    const enumFields: Array<{
      field: string;
      values: readonly string[];
    }> = [
      { field: "payment_trigger", values: PAYMENT_TRIGGERS },
      { field: "client_may_withhold", values: CLIENT_MAY_WITHHOLD },
      { field: "contractor_liability", values: CONTRACTOR_LIABILITY },
      { field: "indemnifying_party", values: INDEMNIFYING_PARTY },
      { field: "scope", values: INDEMNITY_SCOPE },
      { field: "references_defined_losses", values: YES_NO_UNSPECIFIED },
      { field: "transfer_timing", values: TRANSFER_TIMING },
      { field: "conditional_on_payment", values: YES_NO_UNSPECIFIED },
      { field: "client_convenience_termination", values: YES_NO_UNSPECIFIED },
      { field: "payment_for_work_done", values: PAYMENT_FOR_WORK_DONE },
      { field: "handover_required", values: YES_NO_UNSPECIFIED },
      { field: "written_change_order_required", values: YES_NO_UNSPECIFIED },
      { field: "extra_work_without_additional_fee", values: YES_NO_UNSPECIFIED },
      { field: "foreign_to_bangladesh", values: YES_NO_UNSPECIFIED },
      { field: "dispute_forum", values: DISPUTE_FORUM },
      { field: "includes_indirect_or_consequential_losses", values: YES_NO_UNSPECIFIED },
      { field: "client_sole_discretion_acceptance", values: YES_NO_UNSPECIFIED },
      {
        field: "playbook_preference",
        values: [
          "transfer_after_full_payment",
          "transfer_on_delivery",
          "license_only",
          "no_requirement",
        ],
      },
      {
        field: "reason",
        values: [
          "no_payment_clause",
          "unspecified_days_to_pay",
          "no_liability_clause",
          "unspecified_liability_cap",
          "unspecified_liability_cap_multiple",
        ],
      },
      { field: "clock_starts_at", values: PAYMENT_TRIGGERS },
    ];

    expect(en.findingsPane.factLabels.fields.arbitration_foreign_seat).toBeDefined();
    expect(bn.findingsPane.factLabels.fields.arbitration_foreign_seat).toBeDefined();
    expect(en.findingsPane.factLabels.fields.reason).toBeDefined();
    expect(bn.findingsPane.factLabels.fields.reason).toBeDefined();

    for (const { field, values } of enumFields) {
      const enMap = (en.findingsPane.factLabels.values as Record<string, Record<string, string>>)[field];
      const bnMap = (bn.findingsPane.factLabels.values as Record<string, Record<string, string>>)[field];

      expect(enMap, `en.json missing factLabels.values.${field}`).toBeDefined();
      expect(bnMap, `bn.json missing factLabels.values.${field}`).toBeDefined();

      for (const val of values) {
        expect(
          enMap[val],
          `en.json missing label for ${field}.${val}`,
        ).toBeDefined();
        expect(enMap[val].trim().length).toBeGreaterThan(0);

        expect(
          bnMap[val],
          `bn.json missing label for ${field}.${val}`,
        ).toBeDefined();
        expect(bnMap[val].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("renders every finding with all sections expanded without raw snake_case tokens across playbooks and hand-made clause sets", () => {
    const playbooks: PlaybookPreferences[] = [
      DEFAULT_PLAYBOOK,
      { ...DEFAULT_PLAYBOOK, ip_ownership: "license_only" },
      { ...DEFAULT_PLAYBOOK, ip_ownership: "transfer_on_delivery" },
      {
        ...DEFAULT_PLAYBOOK,
        liability_cap: { ...DEFAULT_PLAYBOOK.liability_cap, require_cap: false },
      },
      {
        ...DEFAULT_PLAYBOOK,
        payment_terms: { ...DEFAULT_PLAYBOOK.payment_terms, max_days_to_pay: 15 },
      },
    ];

    const allFindings: Finding[] = [];

    // 1. Evaluate on riskyContractClauses and balancedContractClauses under all playbooks
    for (const pb of playbooks) {
      allFindings.push(...evaluateRiskRules(riskyContractClauses, pb));
      allFindings.push(...evaluateRiskRules(balancedContractClauses, pb));
    }

    // 2. Hand-made clause sets that make PAY-3, LIAB-1 (unspecified and capped) and LAW-1 (arbitration with a foreign seat) fire
    const pay3MissingPaymentClauses: ClauseWithFacts[] = [
      {
        id: "pay3-c1",
        document_id: "00000000-0000-4000-8000-000000000000",
        run_id: null,
        clause_type: "liability",
        verbatim_text: "Liability is capped at 1000 USD.",
        page_number: 1,
        char_start: 0,
        char_end: 32,
        verbatim_verified: true,
        extraction_confidence: "high",
        page_mismatch: false,
        facts: { contractor_liability: "capped", cap_multiple_of_fees: 1 },
        facts_evidence: "capped at 1000 USD",
        facts_verified: true,
        facts_status: "extracted",
        facts_prompt_version: "v3",
      },
    ];

    const pay3UnspecifiedDaysClauses: ClauseWithFacts[] = [
      {
        id: "pay3-c2",
        document_id: "00000000-0000-4000-8000-000000000000",
        run_id: null,
        clause_type: "payment",
        verbatim_text: "Client shall pay invoices upon receipt.",
        page_number: 1,
        char_start: 0,
        char_end: 39,
        verbatim_verified: true,
        extraction_confidence: "high",
        page_mismatch: false,
        facts: { days_to_pay: null, payment_trigger: "invoice_receipt", client_may_withhold: "no" },
        facts_evidence: "pay invoices upon receipt",
        facts_verified: true,
        facts_status: "extracted",
        facts_prompt_version: "v3",
      },
    ];

    const liab1UnspecifiedClauses: ClauseWithFacts[] = [
      {
        id: "liab1-c1",
        document_id: "00000000-0000-4000-8000-000000000000",
        run_id: null,
        clause_type: "payment",
        verbatim_text: "Client shall pay within thirty (30) days.",
        page_number: 1,
        char_start: 0,
        char_end: 41,
        verbatim_verified: true,
        extraction_confidence: "high",
        page_mismatch: false,
        facts: { days_to_pay: 30, payment_trigger: "invoice_receipt" },
        facts_evidence: "within thirty (30) days",
        facts_verified: true,
        facts_status: "extracted",
        facts_prompt_version: "v3",
      },
    ];

    const liab1CappedExceedsClauses: ClauseWithFacts[] = [
      {
        id: "liab1-c2",
        document_id: "00000000-0000-4000-8000-000000000000",
        run_id: null,
        clause_type: "liability",
        verbatim_text: "Contractor liability is capped at five (5) times fees paid.",
        page_number: 1,
        char_start: 0,
        char_end: 59,
        verbatim_verified: true,
        extraction_confidence: "high",
        page_mismatch: false,
        facts: { contractor_liability: "capped", cap_multiple_of_fees: 5 },
        facts_evidence: "capped at five (5) times fees paid",
        facts_verified: true,
        facts_status: "extracted",
        facts_prompt_version: "v3",
      },
    ];

    const liab1CappedUnspecifiedMultipleClauses: ClauseWithFacts[] = [
      {
        id: "liab1-c3",
        document_id: "00000000-0000-4000-8000-000000000000",
        run_id: null,
        clause_type: "liability",
        verbatim_text: "Contractor liability shall be capped as agreed.",
        page_number: 1,
        char_start: 0,
        char_end: 47,
        verbatim_verified: true,
        extraction_confidence: "high",
        page_mismatch: false,
        facts: { contractor_liability: "capped", cap_multiple_of_fees: null },
        facts_evidence: "capped as agreed",
        facts_verified: true,
        facts_status: "extracted",
        facts_prompt_version: "v3",
      },
    ];

    const law1ArbitrationForeignSeatClauses: ClauseWithFacts[] = [
      {
        id: "law1-c1",
        document_id: "00000000-0000-4000-8000-000000000000",
        run_id: null,
        clause_type: "governing_law",
        verbatim_text: "Governed by Singapore law; disputes resolved by arbitration seated in Singapore.",
        page_number: 1,
        char_start: 0,
        char_end: 80,
        verbatim_verified: true,
        extraction_confidence: "high",
        page_mismatch: false,
        facts: {
          governing_law_name: "Singapore law",
          foreign_to_bangladesh: "yes",
          dispute_forum: "arbitration",
          seat: "Singapore",
        },
        facts_evidence: "arbitration seated in Singapore",
        facts_verified: true,
        facts_status: "extracted",
        facts_prompt_version: "v3",
      },
    ];

    allFindings.push(...evaluateRiskRules(pay3MissingPaymentClauses, DEFAULT_PLAYBOOK));
    allFindings.push(...evaluateRiskRules(pay3UnspecifiedDaysClauses, DEFAULT_PLAYBOOK));
    allFindings.push(...evaluateRiskRules(liab1UnspecifiedClauses, DEFAULT_PLAYBOOK));
    allFindings.push(...evaluateRiskRules(liab1CappedExceedsClauses, DEFAULT_PLAYBOOK));
    allFindings.push(...evaluateRiskRules(liab1CappedUnspecifiedMultipleClauses, DEFAULT_PLAYBOOK));
    allFindings.push(...evaluateRiskRules(law1ArbitrationForeignSeatClauses, DEFAULT_PLAYBOOK));

    expect(allFindings.some((f) => f.rule_id === "PAY-3")).toBe(true);
    expect(allFindings.some((f) => f.rule_id === "LIAB-1" && f.params.contractor_liability === "unspecified")).toBe(true);
    expect(allFindings.some((f) => f.rule_id === "LIAB-1" && f.params.contractor_liability === "capped")).toBe(true);
    expect(allFindings.some((f) => f.rule_id === "LAW-1" && f.params.arbitration_foreign_seat === true)).toBe(true);

    const findingRows: FindingRow[] = allFindings.map((f, idx) => ({
      id: `f-${idx}-${f.rule_id}`,
      document_id: "00000000-0000-4000-8000-000000000000",
      extraction_run_id: "11111111-1111-4111-8111-111111111111",
      facts_run_id: "22222222-2222-4222-8222-222222222222",
      rules_version: f.rule_version,
      rule_id: f.rule_id,
      severity: f.severity,
      priority: f.priority,
      params: f.params,
      clause_ids: f.clause_ids,
      evidence: f.evidence,
      lawyer_review: f.lawyer_review,
      lawyer_review_reasons: f.lawyer_review_reasons,
      playbook_snapshot: {},
      created_at: new Date().toISOString(),
    }));

    const renderPane = (locale: "en" | "bn", findingsToRender: FindingRow[]) => {
      const messages = locale === "bn" ? bn.findingsPane : en.findingsPane;
      const html = renderToStaticMarkup(
        React.createElement(FindingsPane, {
          messages: messages as unknown as Messages["findingsPane"],
          locale,
          status: "succeeded",
          errorCode: null,
          isStale: false,
          findings: findingsToRender,
          playbookUsed: "saved",
          hasClauses: true,
          selectedFindingId: null,
          onSelectFinding: () => {},
          onAnalyze: () => {},
          isAnalyzing: false,
          initialExpandedAll: true,
          factsSummary: { total_clauses: 10, verified_clauses: 8, no_facts_clauses: 2, failed_clauses: 0 },
        }),
      );
      return html.replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ");
    };

    const snakeCaseRegex = /\b[a-z]{2,}_[a-z0-9_]+\b/;

    const enText = renderPane("en", findingRows);
    const bnText = renderPane("bn", findingRows);

    expect(enText).not.toMatch(snakeCaseRegex);
    expect(bnText).not.toMatch(snakeCaseRegex);

    // Negative control: unmapped snake_case in template interpolation triggers regex match
    const ip1Finding = findingRows.find((f) => f.rule_id === "IP-1")!;
    const badFinding: FindingRow = {
      ...ip1Finding,
      params: {
        ...(ip1Finding.params as Record<string, unknown>),
        playbook_preference: "unmapped_snake_value",
      },
    };
    const badText = renderPane("en", [badFinding]);
    expect(badText).toMatch(snakeCaseRegex);
  });
});

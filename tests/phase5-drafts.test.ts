import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYBOOK, type PlaybookPreferences } from "@/lib/playbook/schema";
import { evaluateRiskRules, REGISTERED_RULE_IDS, type Finding, type RuleId } from "@/lib/risk";
import {
  buildClientDraftMessage,
  getSuggestedWording,
  getSuggestedWordingNote,
} from "@/lib/risk/drafts";
import bn from "@/lib/i18n/bn.json";
import en from "@/lib/i18n/en.json";
import { riskyContractClauses } from "./fixtures/fact-fixtures";

describe("Phase 5: Client Draft Message & Suggested Wording", () => {
  describe("Client draft message on riskyContractClauses", () => {
    const findings = evaluateRiskRules(riskyContractClauses, DEFAULT_PLAYBOOK);
    const message = buildClientDraftMessage(findings, DEFAULT_PLAYBOOK);

    it("evaluates all 13 rules on risky fixture before drafting", () => {
      expect(findings.length).toBe(13);
      console.log("\n---FULL RISKY CLIENT MESSAGE---\n" + message + "\n-------------------------------");
    });

    it("has no duplicate asks in the risky fixture message", () => {
      const lines = message.split("\n");
      const itemLines = lines.filter((l) => /^\d+\.\s/.test(l));

      const asks = itemLines.map((l) => {
        const colonIdx = l.indexOf(":");
        return colonIdx !== -1 ? l.slice(colonIdx + 1).trim() : l;
      });

      // No duplicate asks
      const uniqueAsks = new Set(asks);
      expect(uniqueAsks.size).toBe(asks.length);
    });

    it("includes deliverable acceptance (ACC-1) in the message", () => {
      expect(message).toContain("Deliverable acceptance criteria");
      expect(message).toContain("10 business days");
    });

    it("deduplicates COMBO-1 and COMBO-2: omits IP-1, PAY-1, and TERM-2, but keeps TERM-1", () => {
      // COMBO-1 covers IP-1 and PAY-1
      expect(message).toContain("IP transfer and payment alignment");
      expect(message).not.toContain("Payment timeline:");
      expect(message).not.toContain("Intellectual property transfer timing:");

      // COMBO-2 covers TERM-2
      expect(message).toContain("IP retention and termination protection");
      expect(message).not.toContain("Payment upon contract termination:");

      // TERM-1 kept separate
      expect(message).toContain("Termination notice period:");
    });

    it("caps at 8 items and formats overflow line with 'further points we can go through together' (never 'smaller')", () => {
      const lines = message.split("\n");
      const itemLines = lines.filter((l) => /^\d+\.\s/.test(l));
      expect(itemLines.length).toBe(8);

      expect(message).toContain("plus 2 further points we can go through together");
      expect(message.toLowerCase()).not.toContain("smaller");
    });

    it("formats overflow as singular 'point' when overflow is 1, and verifies 2-overflow still uses 'points'", () => {
      // Build findings so exactly 9 eligible items remain after dedupe (so overflow is 1)
      const findingsWithNineAfterDedupe = findings.filter((f) => f.rule_id !== "DEF-1");
      const singleOverflowMessage = buildClientDraftMessage(
        findingsWithNineAfterDedupe,
        DEFAULT_PLAYBOOK,
      );

      expect(singleOverflowMessage).toContain("(plus 1 further point we can go through together)");
      expect(singleOverflowMessage).not.toContain("1 further points");

      // Verify the existing 2-overflow case still uses "points"
      expect(message).toContain("(plus 2 further points we can go through together)");
    });
  });

  describe("Suggested wording cleanliness", () => {
    it("ensures no draft body contains annotations like 'replacing' or 'proposed'", () => {
      const testFinding: Finding = {
        rule_id: "COMBO-1",
        rule_version: "2026.11-rules.v1",
        source: "builtin",
        severity: "critical",
        priority: 95,
        clause_ids: ["c-1", "c-2"],
        evidence: [],
        lawyer_review: false,
        lawyer_review_reasons: [],
        params: {
          days_to_pay: 90,
          playbook_max_days: 30,
        },
      };

      for (const ruleId of REGISTERED_RULE_IDS) {
        const finding: Finding = {
          ...testFinding,
          rule_id: ruleId as RuleId,
        };
        const wording = getSuggestedWording(finding, DEFAULT_PLAYBOOK);
        expect(wording).not.toMatch(/\b(replacing|proposed)\b/i);
        expect(wording).not.toMatch(/\(replacing[^\)]*\)/i);
      }
    });
    it("provides separate small note above the clause when contract differs from playbook", () => {
      const findingWithDiscrepancy: Finding = {
        rule_id: "PAY-1",
        rule_version: "2026.11-rules.v1",
        source: "builtin",
        severity: "high",
        priority: 60,
        clause_ids: ["c-1"],
        evidence: [],
        lawyer_review: false,
        lawyer_review_reasons: [],
        params: {
          days_to_pay: 60,
          playbook_max_days: 30,
        },
      };

      const note = getSuggestedWordingNote(findingWithDiscrepancy, DEFAULT_PLAYBOOK);
      expect(note).toBe("Contract says: 60 days. Your limit: 30 days.");
    });
  });

  describe("Disclaimer copy", () => {
    it("has draftMessageDisclaimer in both English and Bengali dictionaries", () => {
      expect(en.findingsPane.draftMessageDisclaimer).toBe(
        "Replace the bracketed names before sending. Starter draft, not lawyer-reviewed.",
      );
      expect(bn.findingsPane.draftMessageDisclaimer).toBe(
        "পাঠানোর আগে বন্ধনীভুক্ত নামগুলো পরিবর্তন করুন। প্রাথমিক খসড়া, আইনজীবীর পর্যালোচিত নয়।",
      );
    });
  });
});

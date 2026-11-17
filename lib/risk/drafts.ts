import { DEFAULT_PLAYBOOK, type PlaybookPreferences } from "@/lib/playbook/schema";
import type { Finding, RuleId } from "./types";

interface DraftContext {
  days_to_pay?: number | null;
  notice_days?: number | null;
  playbook_max_days?: number | null;
  playbook_min_notice_days?: number | null;
  playbook_max_multiple?: number | null;
  playbook_ip_ownership?: string | null;
  cap_multiple_of_fees?: number | null;
  transfer_timing?: string | null;
  payment_for_work_done?: string | null;
}

function extractDraftContext(
  finding: Finding,
  playbook: PlaybookPreferences = DEFAULT_PLAYBOOK,
): DraftContext {
  const p = finding.params || {};

  const daysToPay =
    typeof p.days_to_pay === "number"
      ? p.days_to_pay
      : null;

  const noticeDays =
    typeof p.notice_days === "number"
      ? p.notice_days
      : null;

  const playbookMaxDays =
    typeof p.playbook_max_days === "number"
      ? p.playbook_max_days
      : playbook?.payment_terms?.max_days_to_pay ?? 30;

  const playbookMinNoticeDays =
    typeof p.playbook_min_notice_days === "number"
      ? p.playbook_min_notice_days
      : playbook?.termination?.min_notice_days ?? 30;

  const playbookMaxMultiple =
    typeof p.playbook_max_multiple === "number"
      ? p.playbook_max_multiple
      : typeof p.cap_multiple_of_fees === "number"
        ? p.cap_multiple_of_fees
        : playbook?.liability_cap?.max_multiple_of_fees ?? 1;

  const playbookIpOwnership =
    typeof p.playbook_ip_ownership === "string"
      ? p.playbook_ip_ownership
      : playbook?.ip_ownership ?? "transfer_after_full_payment";

  return {
    days_to_pay: daysToPay,
    notice_days: noticeDays,
    playbook_max_days: playbookMaxDays,
    playbook_min_notice_days: playbookMinNoticeDays,
    playbook_max_multiple: playbookMaxMultiple,
    playbook_ip_ownership: playbookIpOwnership,
    cap_multiple_of_fees: typeof p.cap_multiple_of_fees === "number" ? p.cap_multiple_of_fees : null,
    transfer_timing: typeof p.transfer_timing === "string" ? p.transfer_timing : null,
    payment_for_work_done: typeof p.payment_for_work_done === "string" ? p.payment_for_work_done : null,
  };
}

/**
 * Returns a professional, deterministic English replacement-clause draft for a specific finding.
 * Never leaves unfilled placeholders.
 */
export function getSuggestedWording(
  finding: Finding,
  playbook: PlaybookPreferences = DEFAULT_PLAYBOOK,
): string {
  const ctx = extractDraftContext(finding, playbook);
  const maxDays = ctx.playbook_max_days ?? 30;
  const minNotice = ctx.playbook_min_notice_days ?? 30;
  const daysToPay = ctx.days_to_pay;

  switch (finding.rule_id) {
    case "PAY-1":
      return `Client shall pay all undisputed invoices within ${maxDays} calendar days of receipt of invoice. If Client disputes any portion of an invoice in good faith, Client shall pay the undisputed portion in accordance with this Section and provide written notice of the specific dispute within ten (10) business days.`;

    case "PAY-2":
      return `Invoices shall be issued upon delivery of deliverables or monthly in arrears. Client shall pay each invoice within ${maxDays} calendar days of receipt. Payment shall not be conditioned upon subjective acceptance, and Client may withhold only amounts disputed in good faith with written justification.`;

    case "PAY-3":
      return `Client shall pay Contractor for all services rendered and reimbursable expenses within ${maxDays} calendar days of the invoice date. Any undisputed amount past due shall accrue interest at 1.5% per month or the legal maximum, whichever is lower.`;

    case "LIAB-1": {
      const mult = ctx.playbook_max_multiple ?? 1;
      const capWording =
        mult === 1
          ? "the total fees actually paid to Contractor by Client under this Agreement in the twelve (12) months preceding the claim"
          : `${mult} times the total fees actually paid to Contractor by Client under this Agreement`;

      return `To the maximum extent permitted by applicable law, Contractor's aggregate liability under or in connection with this Agreement, whether in contract, tort (including negligence), or otherwise, shall be capped at and shall not exceed ${capWording}. In no event shall either party be liable for any indirect, special, incidental, or consequential damages.`;
    }

    case "IP-1": {
      const pref = ctx.playbook_ip_ownership;
      if (pref === "license_only") {
        return `Contractor retains all right, title, and interest, including all intellectual property rights, in and to all deliverables. Subject to Client's payment of all applicable fees in full, Contractor grants Client a non-exclusive, perpetual, worldwide, irrevocable license to use, display, and operate the deliverables for Client's internal business purposes.`;
      }
      if (pref === "transfer_on_delivery") {
        return `All intellectual property rights in deliverables created specifically for Client shall transfer to and vest in Client upon delivery of the applicable deliverable, subject to prompt payment of undisputed invoices.`;
      }
      return `All intellectual property rights in deliverables created by Contractor specifically for Client shall transfer to and vest in Client only upon Contractor's receipt of full and final payment for the applicable deliverable. Contractor retains all rights in pre-existing materials, tools, routines, and background technology.`;
    }

    case "TERM-1":
      return `Either party may terminate this Agreement for convenience at any time upon giving not less than ${minNotice} calendar days' prior written notice to the other party.`;

    case "TERM-2":
      return `In the event of termination for convenience by Client, Contractor shall be entitled to payment for all work performed, milestones partially completed, and non-cancelable expenses incurred up to the effective date of termination, calculated on a pro-rata basis.`;

    case "SCOPE-1":
      return `Any modification, addition, or change to the scope of work, deliverables, specifications, or timeline shall be documented in a written Change Order signed by authorized representatives of both parties. Each Change Order shall detail any adjustments to fees and schedule, and Contractor shall not be obligated to perform extra work until the Change Order is executed.`;

    case "LAW-1":
      return `This Agreement and any dispute arising out of or in connection with it shall be governed by and construed in accordance with the laws of Bangladesh. The parties submit to the exclusive jurisdiction of the competent courts of Dhaka, Bangladesh.`;

    case "IND-1":
      return `Each party agrees to defend, indemnify, and hold harmless the other party from and against third-party claims, damages, and reasonable legal costs arising directly from the indemnifying party's gross negligence, willful misconduct, or proven infringement of third-party intellectual property rights, provided the indemnified party gives prompt written notice of any claim.`;

    case "DEF-1":
      return `Neither party shall be liable to the other under this Agreement for any indirect, incidental, consequential, special, punitive, or exemplary damages, or for loss of profits, revenue, goodwill, data, or anticipated savings, regardless of the theory of liability.`;

    case "ACC-1":
      return `Deliverables shall be deemed accepted if Client does not notify Contractor in writing of specific, material non-conformities within ten (10) business days of delivery. Upon receipt of such notice, Contractor shall have ten (10) business days to cure the specified defects. Payment of milestones or fees shall not be conditioned upon subjective or unilateral approval.`;

    case "COMBO-1":
      return `All intellectual property rights in deliverables created by Contractor under this Agreement shall transfer to and vest in Client only upon Contractor's receipt of full and final payment. Client shall pay all undisputed invoices within ${maxDays} calendar days of receipt of invoice. Contractor retains ownership of all work until payment is received in full.`;

    case "COMBO-2":
      return `All intellectual property rights in deliverables shall transfer to Client only upon Contractor's receipt of full and final payment. Either party may terminate this Agreement for convenience upon giving not less than ${minNotice} calendar days' prior written notice. In the event of termination for convenience by Client, Contractor shall be entitled to payment for all work performed, milestones partially completed, and non-cancelable expenses incurred up to the effective date of termination, calculated on a pro-rata basis, and no rights in deliverables shall pass to Client until such payment is made.`;

    default:
      return "The parties agree to amend this clause to reflect balanced and customary commercial terms.";
  }
}

/**
 * Returns a small informative context note above the suggested wording if useful,
 * e.g. "Contract says: 60 days. Your limit: 30 days."
 */
export function getSuggestedWordingNote(
  finding: Finding,
  playbook: PlaybookPreferences = DEFAULT_PLAYBOOK,
): string | null {
  const ctx = extractDraftContext(finding, playbook);
  if (finding.rule_id === "COMBO-1" || finding.rule_id === "PAY-1") {
    if (typeof ctx.days_to_pay === "number" && ctx.playbook_max_days && ctx.days_to_pay > ctx.playbook_max_days) {
      return `Contract says: ${ctx.days_to_pay} days. Your limit: ${ctx.playbook_max_days} days.`;
    }
  }
  if (finding.rule_id === "TERM-1" || finding.rule_id === "COMBO-2") {
    if (typeof ctx.notice_days === "number" && ctx.playbook_min_notice_days && ctx.notice_days < ctx.playbook_min_notice_days) {
      return `Contract says: ${ctx.notice_days} days notice. Your limit: ${ctx.playbook_min_notice_days} days notice.`;
    }
  }
  return null;
}

interface ClientMessageItem {
  title: string;
  ask: string;
}

function getClientMessageItem(
  finding: Finding,
  playbook: PlaybookPreferences = DEFAULT_PLAYBOOK,
): ClientMessageItem {
  const ctx = extractDraftContext(finding, playbook);
  const maxDays = ctx.playbook_max_days ?? 30;
  const minNotice = ctx.playbook_min_notice_days ?? 30;
  const daysToPay = ctx.days_to_pay;
  const noticeDays = ctx.notice_days;

  switch (finding.rule_id) {
    case "PAY-1": {
      const ask =
        daysToPay && daysToPay > 0
          ? `Adjust payment terms from ${daysToPay} days to ${maxDays} days from invoice receipt to maintain sustainable cash flow.`
          : `Set payment terms to ${maxDays} days from invoice receipt.`;
      return { title: "Payment timeline", ask };
    }

    case "PAY-2":
      return {
        title: "Payment triggers and withholding",
        ask: "Tie invoice payment to delivery or invoice receipt rather than subjective client approval, and restrict any withholding strictly to amounts disputed in good faith.",
      };

    case "PAY-3":
      return {
        title: "Payment terms specification",
        ask: `Add an explicit payment schedule specifying payment within ${maxDays} calendar days of invoice receipt.`,
      };

    case "LIAB-1": {
      const mult = ctx.playbook_max_multiple ?? 1;
      const capText = mult === 1 ? "the fees paid under the contract" : `${mult}x the fees paid under the contract`;
      return {
        title: "Liability cap",
        ask: `Add a mutual liability cap limited to ${capText} and exclude indirect or consequential damages.`,
      };
    }

    case "IP-1":
      return {
        title: "Intellectual property transfer timing",
        ask: "Clarify that intellectual property rights in deliverables transfer upon receipt of full payment for each deliverable.",
      };

    case "TERM-1": {
      const ask =
        noticeDays === 0
          ? `Provide a mutual notice period of at least ${minNotice} days for convenience termination rather than immediate termination.`
          : typeof noticeDays === "number" && noticeDays > 0
            ? `Increase the convenience termination notice period from ${noticeDays} days to at least ${minNotice} days.`
            : `Provide a mutual notice period of at least ${minNotice} days for termination for convenience.`;
      return { title: "Termination notice period", ask };
    }

    case "TERM-2":
      return {
        title: "Payment upon contract termination",
        ask: "Ensure pro-rata compensation for all work performed and non-cancelable expenses incurred prior to the termination date.",
      };

    case "SCOPE-1":
      return {
        title: "Scope change procedure",
        ask: "Require signed written change orders specifying fee adjustments before beginning any out-of-scope work.",
      };

    case "LAW-1":
      return {
        title: "Governing law and dispute resolution",
        ask: "Specify Bangladesh law and designate Dhaka as the dispute resolution forum.",
      };

    case "IND-1":
      return {
        title: "Indemnification scope",
        ask: "Make indemnification mutual and narrow contractor indemnity to gross negligence and third-party IP infringement.",
      };

    case "DEF-1":
      return {
        title: "Recoverable damages definition",
        ask: "Exclude indirect, incidental, and consequential damages from defined recoverable losses.",
      };

    case "ACC-1":
      return {
        title: "Deliverable acceptance criteria",
        ask: "Establish objective acceptance criteria with deemed acceptance within 10 business days if no written objection is provided.",
      };

    case "COMBO-1": {
      const ask =
        daysToPay && daysToPay > 0
          ? `Transfer IP rights only after full payment is received, and adjust payment terms from ${daysToPay} days to ${maxDays} days.`
          : `Transfer IP rights only after full payment is received, and adjust payment terms to ${maxDays} days.`;
      return { title: "IP transfer and payment alignment", ask };
    }

    case "COMBO-2":
      return {
        title: "IP retention and termination protection",
        ask: "Retain IP ownership until full payment is received and guarantee pro-rata compensation for completed work if the contract is terminated.",
      };

    default:
      return {
        title: "Commercial terms alignment",
        ask: "Adjust clause to reflect standard and balanced commercial practice.",
      };
  }
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Builds a complete, polite, professional English draft message to the client.
 * Generated purely in-memory from findings.
 * Filters for severity medium or higher in priority order (max 8; indicates remaining if more).
 */
export function buildClientDraftMessage(
  findings: Finding[],
  playbook: PlaybookPreferences = DEFAULT_PLAYBOOK,
): string {
  // Filter for medium or higher severity
  const eligible = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high" || f.severity === "medium",
  );

  // If ACC-1 is present in findings, ensure it is considered
  const acc1Finding = findings.find((f) => f.rule_id === "ACC-1");
  if (acc1Finding && !eligible.some((f) => f.rule_id === "ACC-1")) {
    eligible.push(acc1Finding);
  }

  if (eligible.length === 0) {
    return "Thank you for sending over the agreement. I have reviewed the terms, and everything aligns well with my standard working terms. I look forward to moving forward with the project.";
  }

  // Deduplication rules:
  // - when COMBO-1 is present, omit IP-1 and PAY-1 (it covers both)
  // - when COMBO-2 is present, omit TERM-2
  // - keep TERM-1 separate
  const hasCombo1 = eligible.some((f) => f.rule_id === "COMBO-1");
  const hasCombo2 = eligible.some((f) => f.rule_id === "COMBO-2");

  const filtered = eligible.filter((f) => {
    if (hasCombo1 && (f.rule_id === "IP-1" || f.rule_id === "PAY-1")) {
      return false;
    }
    if (hasCombo2 && f.rule_id === "TERM-2") {
      return false;
    }
    return true;
  });

  // Order by severity then priority descending
  filtered.sort((a, b) => {
    const sevA = SEVERITY_RANK[a.severity] ?? 0;
    const sevB = SEVERITY_RANK[b.severity] ?? 0;
    if (sevB !== sevA) return sevB - sevA;
    return (b.priority ?? 0) - (a.priority ?? 0);
  });

  // Never list the same ask twice
  interface DraftItemWithFinding {
    finding: Finding;
    item: ClientMessageItem;
  }

  const deduped: DraftItemWithFinding[] = [];
  const seenAsks = new Set<string>();

  for (const finding of filtered) {
    const item = getClientMessageItem(finding, playbook);
    const askKey = item.ask.trim();
    if (!seenAsks.has(askKey)) {
      seenAsks.add(askKey);
      deduped.push({ finding, item });
    }
  }

  // Cap at 8 after dedupe, ensuring ACC-1 must appear when present
  const maxItems = 8;
  let topItems = deduped.slice(0, maxItems);

  const hasAcc1InDeduped = deduped.some((d) => d.finding.rule_id === "ACC-1");
  if (hasAcc1InDeduped && !topItems.some((d) => d.finding.rule_id === "ACC-1")) {
    const acc1Index = deduped.findIndex((d) => d.finding.rule_id === "ACC-1");
    if (acc1Index !== -1) {
      const acc1Item = deduped[acc1Index];
      // Replace the 8th item (index 7) with ACC-1 so ACC-1 appears
      topItems = [...topItems.slice(0, maxItems - 1), acc1Item];
    }
  }

  const overflowCount = deduped.length - topItems.length;

  const items: string[] = [];
  topItems.forEach((d, index) => {
    items.push(`${index + 1}. ${d.item.title}: ${d.item.ask}`);
  });

  if (overflowCount > 0) {
    items.push(`(plus ${overflowCount} further points we can go through together)`);
  }

  const lines = [
    "Hi [Client],",
    "",
    "Thank you for sending over the agreement. I have reviewed the terms and would like to suggest a few adjustments to ensure a balanced foundation for our collaboration:",
    "",
    items.join("\n"),
    "",
    "Please let me know if these adjustments work for you, and I can prepare the revised draft. Looking forward to working together.",
    "",
    "Best regards,",
    "[Your Name / Team]",
  ];

  return lines.join("\n");
}
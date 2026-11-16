import { type Locale, getMessages } from "@/lib/i18n";
import type { Finding } from "./types";

export interface FormattedFindingText {
  title: string;
  vsLine: string;
  reason: string;
  recommendation: string;
  uncertainty: string | null;
  financialConsequence: string | null;
}

function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const val = params[key];
    if (val !== undefined && val !== null) {
      return String(val);
    }
    return match;
  });
}

export function formatFindingText(
  finding: Finding,
  locale: Locale,
): FormattedFindingText {
  const dict = getMessages(locale).findingsPane;
  const ruleTemplates = dict.rules[finding.rule_id as keyof typeof dict.rules];

  if (!ruleTemplates) {
    return {
      title: finding.rule_id,
      vsLine: dict.defaultVsLine,
      reason: dict.defaultReason,
      recommendation: dict.defaultRecommendation,
      uncertainty: null,
      financialConsequence: null,
    };
  }

  const factValueLabels = dict.factLabels?.values as Record<string, Record<string, string>> | undefined;

  // Localize parameters so no raw snake_case reaches templates
  const localizedParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(finding.params)) {
    const enumMap = factValueLabels?.[key];
    if (typeof value === "string") {
      if (enumMap && typeof enumMap === "object" && value in enumMap) {
        localizedParams[key] = enumMap[value];
      } else {
        localizedParams[key] = value;
      }
    } else if (Array.isArray(value)) {
      const joiner = key === "source_rules"
        ? (locale === "bn" ? " ও " : " and ")
        : ", ";
      localizedParams[key] = value
        .map((item) => {
          if (typeof item === "string" && enumMap && typeof enumMap === "object" && item in enumMap) {
            return enumMap[item];
          }
          return String(item);
        })
        .join(joiner);
    } else if (typeof value === "boolean") {
      localizedParams[key] = value ? (dict.yesLabel ?? "Yes") : (dict.noLabel ?? "No");
    } else {
      localizedParams[key] = value;
    }
  }

  // Specialized vsLine template selection
  let vsLineTemplate = ruleTemplates.vsLine;
  if (finding.rule_id === "LIAB-1") {
    const liabVal = finding.params.contractor_liability;
    const capMult = finding.params.cap_multiple_of_fees;
    const rT = ruleTemplates as unknown as Record<string, string>;
    if (liabVal === "unlimited") {
      vsLineTemplate = rT.vsLineUnlimited ?? ruleTemplates.vsLine;
    } else if (liabVal === "capped" && capMult !== null && capMult !== undefined) {
      vsLineTemplate = rT.vsLineCapped ?? ruleTemplates.vsLine;
    } else if (liabVal === "capped") {
      vsLineTemplate = rT.vsLineCappedUnspecified ?? ruleTemplates.vsLine;
    } else {
      vsLineTemplate = rT.vsLineUnspecified ?? ruleTemplates.vsLine;
    }
  } else if (finding.rule_id === "PAY-2") {
    const trigger = finding.params.payment_trigger;
    const withhold = finding.params.client_may_withhold;
    const triggerText = typeof trigger === "string" ? factValueLabels?.payment_trigger?.[trigger] : null;
    const withholdText = typeof withhold === "string" ? factValueLabels?.client_may_withhold?.[withhold] : null;

    let contractTerms = "";
    if (triggerText && withholdText && withhold === "for_unaccepted_work") {
      contractTerms = locale === "bn"
        ? `${triggerText} ও ${withholdText}`
        : `${triggerText} and withholding ${withholdText}`;
    } else if (triggerText) {
      contractTerms = triggerText;
    } else if (withholdText) {
      contractTerms = locale === "bn" ? withholdText : `withholding ${withholdText}`;
    } else {
      contractTerms = locale === "bn" ? "অননুমোদিত শর্ত" : "delayed payment conditions";
    }
    localizedParams.contract_terms = contractTerms;
  } else if (finding.rule_id === "COMBO-2") {
    const noticeDays = finding.params.notice_days;
    const rT = ruleTemplates as unknown as Record<string, string>;
    if (noticeDays === null || noticeDays === undefined || noticeDays === 0) {
      vsLineTemplate = rT.vsLineNoNotice ?? ruleTemplates.vsLine;
    }

    const payWorkDone = finding.params.payment_for_work_done;
    if (locale === "bn") {
      if (payWorkDone === "only_invoiced") {
        localizedParams.payment_for_work_done = "কেবলমাত্র ইনভয়েস করা কাজের পারিশ্রমিক দিতে পারে";
      } else if (payWorkDone === "none") {
        localizedParams.payment_for_work_done = "সম্পন্ন কাজের কোনো পারিশ্রমিক দিতে বাধ্য নয়";
      }
    } else {
      if (payWorkDone === "only_invoiced") {
        localizedParams.payment_for_work_done = "only pay for invoiced work";
      } else if (payWorkDone === "none") {
        localizedParams.payment_for_work_done = "pay nothing for completed work";
      }
    }
  }

  const title = interpolate(ruleTemplates.title, localizedParams);
  const vsLine = interpolate(vsLineTemplate, localizedParams);
  const reason = interpolate(ruleTemplates.reason, localizedParams);
  const recommendation = interpolate(ruleTemplates.recommendation, localizedParams);
  const uncertainty = ruleTemplates.uncertainty
    ? interpolate(ruleTemplates.uncertainty, localizedParams)
    : null;

  let financialConsequence: string | null = null;
  if (
    finding.params.amount !== undefined &&
    finding.params.amount !== null &&
    finding.params.days_to_pay !== undefined &&
    ruleTemplates.financialConsequence
  ) {
    const triggersMap = dict.triggers as Record<string, string>;
    const event = typeof finding.params.clock_starts_at === "string"
      ? (triggersMap[finding.params.clock_starts_at] ??
          factValueLabels?.clock_starts_at?.[finding.params.clock_starts_at] ??
          finding.params.clock_starts_at)
      : (dict.defaultEvent ?? "invoice");

    financialConsequence = interpolate(ruleTemplates.financialConsequence, {
      ...localizedParams,
      event,
    });
  }

  return {
    title,
    vsLine,
    reason,
    recommendation,
    uncertainty,
    financialConsequence,
  };
}

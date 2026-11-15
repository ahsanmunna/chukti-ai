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

  const title = interpolate(ruleTemplates.title, finding.params);
  const vsLine = interpolate(ruleTemplates.vsLine, finding.params);
  const reason = interpolate(ruleTemplates.reason, finding.params);
  const recommendation = interpolate(ruleTemplates.recommendation, finding.params);
  const uncertainty = ruleTemplates.uncertainty
    ? interpolate(ruleTemplates.uncertainty, finding.params)
    : null;

  let financialConsequence: string | null = null;
  if (
    finding.params.amount !== undefined &&
    finding.params.amount !== null &&
    finding.params.days_to_pay !== undefined &&
    ruleTemplates.financialConsequence
  ) {
    const event = typeof finding.params.clock_starts_at === "string"
      ? (dict.triggers[finding.params.clock_starts_at as keyof typeof dict.triggers] ?? finding.params.clock_starts_at)
      : (dict.defaultEvent ?? "invoice");

    financialConsequence = interpolate(ruleTemplates.financialConsequence, {
      ...finding.params,
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

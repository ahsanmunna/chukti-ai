import type { PlaybookPreferences } from "@/lib/playbook/schema";
import type { ClauseType, RiskSeverity } from "@/lib/supabase/types";

export const RISK_RULES_VERSION = "v2" as const;

export type RuleSource = "playbook" | "builtin";

export const REGISTERED_RULE_IDS = [
  "PAY-1",
  "PAY-2",
  "PAY-3",
  "LIAB-1",
  "IP-1",
  "TERM-1",
  "TERM-2",
  "SCOPE-1",
  "LAW-1",
  "IND-1",
  "DEF-1",
] as const;

export type RuleId = (typeof REGISTERED_RULE_IDS)[number];

export const SEVERITY_PRIORITY_WEIGHTS: Record<RiskSeverity, number> = {
  low: 10,
  medium: 30,
  high: 60,
  critical: 90,
};

export interface FindingEvidence {
  clause_id: string;
  page_number: number;
  char_start: number;
  char_end: number;
  quote: string;
}

export interface Finding {
  rule_id: RuleId;
  rule_version: string;
  source: RuleSource;
  severity: RiskSeverity;
  priority: number;
  clause_ids: string[];
  evidence: FindingEvidence[];
  params: Record<string, unknown>;
  lawyer_review: boolean;
  lawyer_review_reasons: string[];
}

export interface ClauseWithFacts {
  id: string;
  document_id: string;
  run_id: string | null;
  clause_type: ClauseType;
  verbatim_text: string;
  page_number: number;
  char_start: number | null;
  char_end: number | null;
  verbatim_verified: boolean;
  extraction_confidence: "low" | "medium" | "high" | null;
  page_mismatch: boolean;
  facts: Record<string, unknown> | null;
  facts_evidence: string | null;
  facts_verified: boolean;
  facts_prompt_version: string | null;
}

export type AggregationState<T> =
  | { state: "unspecified"; value: null; clause_ids: string[]; clauses: ClauseWithFacts[] }
  | { state: "single"; value: T; clause_ids: string[]; clauses: ClauseWithFacts[] }
  | { state: "conflicting"; values: T[]; clause_ids: string[]; clauses: ClauseWithFacts[] };

export interface AggregatedFactsByType {
  payment: {
    total_fee_amount: AggregationState<number>;
    currency: AggregationState<string>;
    days_to_pay: AggregationState<number>;
    payment_trigger: AggregationState<string>;
    client_may_withhold: AggregationState<string>;
    clauses: ClauseWithFacts[];
  };
  liability: {
    contractor_liability: AggregationState<string>;
    cap_multiple_of_fees: AggregationState<number>;
    clauses: ClauseWithFacts[];
  };
  indemnity: {
    indemnifying_party: AggregationState<string>;
    scope: AggregationState<string>;
    references_defined_losses: AggregationState<string>;
    clauses: ClauseWithFacts[];
  };
  ip_ownership: {
    transfer_timing: AggregationState<string>;
    conditional_on_payment: AggregationState<string>;
    clauses: ClauseWithFacts[];
  };
  termination: {
    client_convenience_termination: AggregationState<string>;
    notice_days: AggregationState<number>;
    payment_for_work_done: AggregationState<string>;
    handover_required: AggregationState<string>;
    clauses: ClauseWithFacts[];
  };
  scope_change: {
    written_change_order_required: AggregationState<string>;
    extra_work_without_additional_fee: AggregationState<string>;
    clauses: ClauseWithFacts[];
  };
  governing_law: {
    governing_law_name: AggregationState<string>;
    foreign_to_bangladesh: AggregationState<string>;
    dispute_forum: AggregationState<string>;
    seat: AggregationState<string>;
    clauses: ClauseWithFacts[];
  };
  definition: {
    defined_term: AggregationState<string>;
    includes_indirect_or_consequential_losses: AggregationState<string>;
    client_sole_discretion_acceptance: AggregationState<string>;
    clauses: ClauseWithFacts[];
  };
}

export interface RuleEvaluationContext {
  clauses: ClauseWithFacts[];
  playbook: PlaybookPreferences;
  aggregated: AggregatedFactsByType;
}

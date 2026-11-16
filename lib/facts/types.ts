import { z } from "zod";
import type { ClauseType } from "@/lib/supabase/types";

export const YES_NO_UNSPECIFIED = ["yes", "no", "unspecified"] as const;
export type YesNoUnspecified = (typeof YES_NO_UNSPECIFIED)[number];

export const CLIENT_MAY_WITHHOLD = [
  "for_unaccepted_work",
  "disputed_portion_only",
  "no",
  "unspecified",
] as const;
export type ClientMayWithhold = (typeof CLIENT_MAY_WITHHOLD)[number];

export const PAYMENT_TRIGGERS = [
  "invoice_receipt",
  "delivery",
  "acceptance",
  "delivery_and_acceptance",
  "milestone",
  "other",
  "unspecified",
] as const;
export type PaymentTrigger = (typeof PAYMENT_TRIGGERS)[number];

export const CONTRACTOR_LIABILITY = [
  "unlimited",
  "capped",
  "excluded",
  "unspecified",
] as const;
export type ContractorLiability = (typeof CONTRACTOR_LIABILITY)[number];

export const INDEMNIFYING_PARTY = [
  "contractor",
  "client",
  "mutual",
  "unspecified",
] as const;
export type IndemnifyingParty = (typeof INDEMNIFYING_PARTY)[number];

export const INDEMNITY_SCOPE = ["broad", "limited", "unspecified"] as const;
export type IndemnityScope = (typeof INDEMNITY_SCOPE)[number];

export const TRANSFER_TIMING = [
  "on_creation",
  "on_delivery",
  "on_full_payment",
  "license_only",
  "unspecified",
] as const;
export type TransferTiming = (typeof TRANSFER_TIMING)[number];

export const PAYMENT_FOR_WORK_DONE = [
  "full",
  "only_invoiced",
  "none",
  "unspecified",
] as const;
export type PaymentForWorkDone = (typeof PAYMENT_FOR_WORK_DONE)[number];

export const DISPUTE_FORUM = ["courts", "arbitration", "unspecified"] as const;
export type DisputeForum = (typeof DISPUTE_FORUM)[number];

export const ACCEPTANCE_DECIDER = [
  "client_sole",
  "mutual_or_objective",
  "not_specified",
  "unspecified",
] as const;
export type AcceptanceDecider = (typeof ACCEPTANCE_DECIDER)[number];

export interface PaymentFacts {
  total_fee_amount: number | null;
  currency: string | null;
  days_to_pay: number | null;
  payment_trigger: PaymentTrigger;
  client_may_withhold: ClientMayWithhold;
}

export interface LiabilityFacts {
  contractor_liability: ContractorLiability;
  cap_multiple_of_fees: number | null;
}

export interface IndemnityFacts {
  indemnifying_party: IndemnifyingParty;
  scope: IndemnityScope;
  references_defined_losses: YesNoUnspecified;
}

export interface IpOwnershipFacts {
  transfer_timing: TransferTiming;
  conditional_on_payment: YesNoUnspecified;
}

export interface TerminationFacts {
  client_convenience_termination: YesNoUnspecified;
  notice_days: number | null;
  payment_for_work_done: PaymentForWorkDone;
  handover_required: YesNoUnspecified;
}

export interface ScopeChangeFacts {
  written_change_order_required: YesNoUnspecified;
  extra_work_without_additional_fee: YesNoUnspecified;
}

export interface GoverningLawFacts {
  governing_law_name: string | null;
  foreign_to_bangladesh: YesNoUnspecified;
  dispute_forum: DisputeForum;
  seat: string | null;
}

export interface DefinitionFacts {
  defined_term: string | null;
  includes_indirect_or_consequential_losses: YesNoUnspecified;
  client_sole_discretion_acceptance: YesNoUnspecified;
  acceptance_decider: AcceptanceDecider;
  payment_tied_to_acceptance: YesNoUnspecified;
}

export type ClauseFactsMap = {
  payment: PaymentFacts;
  liability: LiabilityFacts;
  indemnity: IndemnityFacts;
  ip_ownership: IpOwnershipFacts;
  termination: TerminationFacts;
  scope_change: ScopeChangeFacts;
  governing_law: GoverningLawFacts;
  definition: DefinitionFacts;
};

export type AnyClauseFacts = ClauseFactsMap[keyof ClauseFactsMap];

export const rawFlatFactsSchema = z.object({
  total_fee_amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  days_to_pay: z.number().int().nullable().optional(),
  payment_trigger: z.enum(PAYMENT_TRIGGERS).nullable().optional(),
  client_may_withhold: z.enum(CLIENT_MAY_WITHHOLD).nullable().optional(),
  contractor_liability: z.enum(CONTRACTOR_LIABILITY).nullable().optional(),
  cap_multiple_of_fees: z.number().nullable().optional(),
  indemnifying_party: z.enum(INDEMNIFYING_PARTY).nullable().optional(),
  scope: z.enum(INDEMNITY_SCOPE).nullable().optional(),
  references_defined_losses: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  transfer_timing: z.enum(TRANSFER_TIMING).nullable().optional(),
  conditional_on_payment: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  client_convenience_termination: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  notice_days: z.number().int().nullable().optional(),
  payment_for_work_done: z.enum(PAYMENT_FOR_WORK_DONE).nullable().optional(),
  handover_required: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  written_change_order_required: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  extra_work_without_additional_fee: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  governing_law_name: z.string().nullable().optional(),
  foreign_to_bangladesh: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  dispute_forum: z.enum(DISPUTE_FORUM).nullable().optional(),
  seat: z.string().nullable().optional(),
  defined_term: z.string().nullable().optional(),
  includes_indirect_or_consequential_losses: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  client_sole_discretion_acceptance: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
  acceptance_decider: z.enum(ACCEPTANCE_DECIDER).nullable().optional(),
  payment_tied_to_acceptance: z.enum(YES_NO_UNSPECIFIED).nullable().optional(),
}).passthrough();

export type RawFlatFacts = z.infer<typeof rawFlatFactsSchema>;

export const factsResponseItemSchema = z.object({
  clause: z.string(),
  evidence_quote: z.string().default(""),
  facts: rawFlatFactsSchema.default({}),
});

export const factsResponseSchema = z.object({
  items: z.array(factsResponseItemSchema),
});

export type FactsResponse = z.infer<typeof factsResponseSchema>;

export type DroppedFactReason =
  | "missing_evidence"
  | "too_short"
  | "too_long"
  | "not_in_clause_but_in_document"
  | "not_in_document"
  | "no_item";

export interface DroppedClauseFact {
  clause_id: string;
  clause_type: ClauseType;
  reason: DroppedFactReason;
  evidence_length: number;
}

export function areAllFactFieldsNullOrUnspecified(facts: AnyClauseFacts): boolean {
  for (const value of Object.values(facts)) {
    if (value !== null && value !== undefined && value !== "unspecified") {
      return false;
    }
  }
  return true;
}

export function getDefaultFactsForType(clauseType: ClauseType): AnyClauseFacts {
  switch (clauseType) {
    case "payment":
      return {
        total_fee_amount: null,
        currency: null,
        days_to_pay: null,
        payment_trigger: "unspecified",
        client_may_withhold: "unspecified",
      };
    case "liability":
      return {
        contractor_liability: "unspecified",
        cap_multiple_of_fees: null,
      };
    case "indemnity":
      return {
        indemnifying_party: "unspecified",
        scope: "unspecified",
        references_defined_losses: "unspecified",
      };
    case "ip_ownership":
      return {
        transfer_timing: "unspecified",
        conditional_on_payment: "unspecified",
      };
    case "termination":
      return {
        client_convenience_termination: "unspecified",
        notice_days: null,
        payment_for_work_done: "unspecified",
        handover_required: "unspecified",
      };
    case "scope_change":
      return {
        written_change_order_required: "unspecified",
        extra_work_without_additional_fee: "unspecified",
      };
    case "governing_law":
      return {
        governing_law_name: null,
        foreign_to_bangladesh: "unspecified",
        dispute_forum: "unspecified",
        seat: null,
      };
    case "definition":
      return {
        defined_term: null,
        includes_indirect_or_consequential_losses: "unspecified",
        client_sole_discretion_acceptance: "unspecified",
        acceptance_decider: "unspecified",
        payment_tied_to_acceptance: "unspecified",
      };
  }
}

export function filterFactsForClauseType(
  clauseType: ClauseType,
  raw: RawFlatFacts,
): AnyClauseFacts {
  switch (clauseType) {
    case "payment":
      return {
        total_fee_amount: typeof raw.total_fee_amount === "number" ? raw.total_fee_amount : null,
        currency: typeof raw.currency === "string" && raw.currency.trim().length > 0 ? raw.currency.trim() : null,
        days_to_pay: typeof raw.days_to_pay === "number" ? raw.days_to_pay : null,
        payment_trigger: raw.payment_trigger ?? "unspecified",
        client_may_withhold: raw.client_may_withhold ?? "unspecified",
      };
    case "liability":
      return {
        contractor_liability: raw.contractor_liability ?? "unspecified",
        cap_multiple_of_fees: typeof raw.cap_multiple_of_fees === "number" ? raw.cap_multiple_of_fees : null,
      };
    case "indemnity":
      return {
        indemnifying_party: raw.indemnifying_party ?? "unspecified",
        scope: raw.scope ?? "unspecified",
        references_defined_losses: raw.references_defined_losses ?? "unspecified",
      };
    case "ip_ownership":
      return {
        transfer_timing: raw.transfer_timing ?? "unspecified",
        conditional_on_payment: raw.conditional_on_payment ?? "unspecified",
      };
    case "termination":
      return {
        client_convenience_termination: raw.client_convenience_termination ?? "unspecified",
        notice_days: typeof raw.notice_days === "number" ? raw.notice_days : null,
        payment_for_work_done: raw.payment_for_work_done ?? "unspecified",
        handover_required: raw.handover_required ?? "unspecified",
      };
    case "scope_change":
      return {
        written_change_order_required: raw.written_change_order_required ?? "unspecified",
        extra_work_without_additional_fee: raw.extra_work_without_additional_fee ?? "unspecified",
      };
    case "governing_law": {
      const lawName =
        typeof raw.governing_law_name === "string" && raw.governing_law_name.trim().length > 0
          ? raw.governing_law_name.trim()
          : null;
      let foreignToBangladesh = raw.foreign_to_bangladesh ?? "unspecified";
      if (lawName !== null) {
        foreignToBangladesh = /bangladesh/i.test(lawName) ? "no" : "yes";
      }
      return {
        governing_law_name: lawName,
        foreign_to_bangladesh: foreignToBangladesh,
        dispute_forum: raw.dispute_forum ?? "unspecified",
        seat: typeof raw.seat === "string" && raw.seat.trim().length > 0 ? raw.seat.trim() : null,
      };
    }
    case "definition":
      return {
        defined_term: typeof raw.defined_term === "string" && raw.defined_term.trim().length > 0 ? raw.defined_term.trim() : null,
        includes_indirect_or_consequential_losses: raw.includes_indirect_or_consequential_losses ?? "unspecified",
        client_sole_discretion_acceptance: raw.client_sole_discretion_acceptance ?? "unspecified",
        acceptance_decider:
          raw.acceptance_decider ??
          (raw.client_sole_discretion_acceptance === "yes"
            ? "client_sole"
            : raw.client_sole_discretion_acceptance === "no"
              ? "mutual_or_objective"
              : "unspecified"),
        payment_tied_to_acceptance: raw.payment_tied_to_acceptance ?? "unspecified",
      };
  }
}

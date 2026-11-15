import type {
  AggregatedFactsByType,
  AggregationState,
  ClauseWithFacts,
} from "./types";

export function aggregateFieldValue<T>(
  clauses: ClauseWithFacts[],
  extractor: (facts: Record<string, unknown>) => T | null | undefined,
): AggregationState<T> {
  const valueMap = new Map<T, { clauseIds: string[]; clauses: ClauseWithFacts[] }>();

  for (const clause of clauses) {
    if (!clause.facts) continue;
    const rawVal = extractor(clause.facts);
    if (
      rawVal === null ||
      rawVal === undefined ||
      rawVal === "unspecified" ||
      (typeof rawVal === "string" && rawVal.trim().length === 0)
    ) {
      continue;
    }

    const existing = valueMap.get(rawVal);
    if (existing) {
      existing.clauseIds.push(clause.id);
      existing.clauses.push(clause);
    } else {
      valueMap.set(rawVal, { clauseIds: [clause.id], clauses: [clause] });
    }
  }

  const distinctValues = Array.from(valueMap.keys());

  if (distinctValues.length === 0) {
    return {
      state: "unspecified",
      value: null,
      clause_ids: clauses.map((c) => c.id),
      clauses,
    };
  }

  if (distinctValues.length === 1) {
    const singleVal = distinctValues[0];
    const data = valueMap.get(singleVal)!;
    return {
      state: "single",
      value: singleVal,
      clause_ids: data.clauseIds,
      clauses: data.clauses,
    };
  }

  const allSupportingClauseIds = Array.from(
    new Set(Array.from(valueMap.values()).flatMap((v) => v.clauseIds)),
  );
  const allSupportingClauses = Array.from(
    new Set(Array.from(valueMap.values()).flatMap((v) => v.clauses)),
  );

  return {
    state: "conflicting",
    values: distinctValues,
    clause_ids: allSupportingClauseIds,
    clauses: allSupportingClauses,
  };
}

export function aggregateClauseFacts(clauses: ClauseWithFacts[]): AggregatedFactsByType {
  const paymentClauses = clauses.filter((c) => c.clause_type === "payment");
  const liabilityClauses = clauses.filter((c) => c.clause_type === "liability");
  const indemnityClauses = clauses.filter((c) => c.clause_type === "indemnity");
  const ipClauses = clauses.filter((c) => c.clause_type === "ip_ownership");
  const terminationClauses = clauses.filter((c) => c.clause_type === "termination");
  const scopeClauses = clauses.filter((c) => c.clause_type === "scope_change");
  const governingClauses = clauses.filter((c) => c.clause_type === "governing_law");
  const definitionClauses = clauses.filter((c) => c.clause_type === "definition");

  return {
    payment: {
      total_fee_amount: aggregateFieldValue<number>(paymentClauses, (f) =>
        typeof f.total_fee_amount === "number" ? f.total_fee_amount : null,
      ),
      currency: aggregateFieldValue<string>(paymentClauses, (f) =>
        typeof f.currency === "string" ? f.currency : null,
      ),
      days_to_pay: aggregateFieldValue<number>(paymentClauses, (f) =>
        typeof f.days_to_pay === "number" ? f.days_to_pay : null,
      ),
      payment_trigger: aggregateFieldValue<string>(paymentClauses, (f) =>
        typeof f.payment_trigger === "string" ? f.payment_trigger : null,
      ),
      client_may_withhold: aggregateFieldValue<string>(paymentClauses, (f) =>
        typeof f.client_may_withhold === "string" ? f.client_may_withhold : null,
      ),
      clauses: paymentClauses,
    },
    liability: {
      contractor_liability: aggregateFieldValue<string>(liabilityClauses, (f) =>
        typeof f.contractor_liability === "string" ? f.contractor_liability : null,
      ),
      cap_multiple_of_fees: aggregateFieldValue<number>(liabilityClauses, (f) =>
        typeof f.cap_multiple_of_fees === "number" ? f.cap_multiple_of_fees : null,
      ),
      clauses: liabilityClauses,
    },
    indemnity: {
      indemnifying_party: aggregateFieldValue<string>(indemnityClauses, (f) =>
        typeof f.indemnifying_party === "string" ? f.indemnifying_party : null,
      ),
      scope: aggregateFieldValue<string>(indemnityClauses, (f) =>
        typeof f.scope === "string" ? f.scope : null,
      ),
      references_defined_losses: aggregateFieldValue<string>(indemnityClauses, (f) =>
        typeof f.references_defined_losses === "string" ? f.references_defined_losses : null,
      ),
      clauses: indemnityClauses,
    },
    ip_ownership: {
      transfer_timing: aggregateFieldValue<string>(ipClauses, (f) =>
        typeof f.transfer_timing === "string" ? f.transfer_timing : null,
      ),
      conditional_on_payment: aggregateFieldValue<string>(ipClauses, (f) =>
        typeof f.conditional_on_payment === "string" ? f.conditional_on_payment : null,
      ),
      clauses: ipClauses,
    },
    termination: {
      client_convenience_termination: aggregateFieldValue<string>(terminationClauses, (f) =>
        typeof f.client_convenience_termination === "string" ? f.client_convenience_termination : null,
      ),
      notice_days: aggregateFieldValue<number>(terminationClauses, (f) =>
        typeof f.notice_days === "number" ? f.notice_days : null,
      ),
      payment_for_work_done: aggregateFieldValue<string>(terminationClauses, (f) =>
        typeof f.payment_for_work_done === "string" ? f.payment_for_work_done : null,
      ),
      handover_required: aggregateFieldValue<string>(terminationClauses, (f) =>
        typeof f.handover_required === "string" ? f.handover_required : null,
      ),
      clauses: terminationClauses,
    },
    scope_change: {
      written_change_order_required: aggregateFieldValue<string>(scopeClauses, (f) =>
        typeof f.written_change_order_required === "string" ? f.written_change_order_required : null,
      ),
      extra_work_without_additional_fee: aggregateFieldValue<string>(scopeClauses, (f) =>
        typeof f.extra_work_without_additional_fee === "string" ? f.extra_work_without_additional_fee : null,
      ),
      clauses: scopeClauses,
    },
    governing_law: {
      governing_law_name: aggregateFieldValue<string>(governingClauses, (f) =>
        typeof f.governing_law_name === "string" ? f.governing_law_name : null,
      ),
      foreign_to_bangladesh: aggregateFieldValue<string>(governingClauses, (f) =>
        typeof f.foreign_to_bangladesh === "string" ? f.foreign_to_bangladesh : null,
      ),
      dispute_forum: aggregateFieldValue<string>(governingClauses, (f) =>
        typeof f.dispute_forum === "string" ? f.dispute_forum : null,
      ),
      seat: aggregateFieldValue<string>(governingClauses, (f) =>
        typeof f.seat === "string" ? f.seat : null,
      ),
      clauses: governingClauses,
    },
    definition: {
      defined_term: aggregateFieldValue<string>(definitionClauses, (f) =>
        typeof f.defined_term === "string" ? f.defined_term : null,
      ),
      includes_indirect_or_consequential_losses: aggregateFieldValue<string>(definitionClauses, (f) =>
        typeof f.includes_indirect_or_consequential_losses === "string" ? f.includes_indirect_or_consequential_losses : null,
      ),
      client_sole_discretion_acceptance: aggregateFieldValue<string>(definitionClauses, (f) =>
        typeof f.client_sole_discretion_acceptance === "string" ? f.client_sole_discretion_acceptance : null,
      ),
      clauses: definitionClauses,
    },
  };
}

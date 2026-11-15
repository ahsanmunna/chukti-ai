import type { PlaybookPreferences } from "@/lib/playbook/schema";
import { verifyFactEvidenceQuote } from "@/lib/facts/verify";
import { aggregateClauseFacts } from "./aggregate";
import {
  type ClauseWithFacts,
  type Finding,
  type FindingEvidence,
  REGISTERED_RULE_IDS,
  RISK_RULES_VERSION,
  type RuleEvaluationContext,
  type RuleId,
  SEVERITY_PRIORITY_WEIGHTS,
} from "./types";

function buildEvidenceForClauses(clauses: ClauseWithFacts[]): FindingEvidence[] {
  const items: FindingEvidence[] = [];
  const seen = new Set<string>();

  for (const clause of clauses) {
    let evItem: FindingEvidence;
    if (clause.facts_evidence) {
      const verifyRes = verifyFactEvidenceQuote(
        clause.verbatim_text,
        clause.char_start,
        clause.facts_evidence,
      );
      if (verifyRes.valid) {
        evItem = {
          clause_id: clause.id,
          page_number: clause.page_number,
          char_start: verifyRes.char_start,
          char_end: verifyRes.char_end,
          quote: verifyRes.quote,
        };
      } else {
        evItem = {
          clause_id: clause.id,
          page_number: clause.page_number,
          char_start: clause.char_start ?? 0,
          char_end: clause.char_end ?? (clause.char_start ?? 0) + clause.verbatim_text.length,
          quote: clause.verbatim_text,
        };
      }
    } else {
      evItem = {
        clause_id: clause.id,
        page_number: clause.page_number,
        char_start: clause.char_start ?? 0,
        char_end: clause.char_end ?? (clause.char_start ?? 0) + clause.verbatim_text.length,
        quote: clause.verbatim_text,
      };
    }

    const key = `${evItem.clause_id}:${evItem.page_number}:${evItem.char_start}:${evItem.char_end}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push(evItem);
    }
  }

  // Ordered by page, then position
  items.sort((a, b) => {
    if (a.page_number !== b.page_number) {
      return a.page_number - b.page_number;
    }
    return a.char_start - b.char_start;
  });

  return items;
}

function evaluateLawyerReview(
  supportingClauses: ClauseWithFacts[],
  ruleRequiresReview: boolean,
  hasConflictingFacts: boolean,
  hasUnspecifiedFacts: boolean,
  extraReasons: string[] = [],
): { lawyer_review: boolean; lawyer_review_reasons: string[] } {
  const reasons: string[] = [...extraReasons];

  if (ruleRequiresReview && reasons.length === 0) {
    reasons.push("rule_requires_review");
  }
  if (hasConflictingFacts) {
    reasons.push("conflicting_facts");
  }
  if (hasUnspecifiedFacts) {
    reasons.push("unspecified_facts");
  }

  const hasLowConfidence = supportingClauses.some(
    (c) => c.extraction_confidence === "low",
  );
  if (hasLowConfidence) {
    reasons.push("low_model_confidence");
  }

  const hasDroppedFacts = supportingClauses.some(
    (c) => c.facts_status === "failed",
  );
  if (hasDroppedFacts) {
    reasons.push("facts_dropped");
  }

  const dedupedReasons = Array.from(new Set(reasons));
  const lawyer_review =
    ruleRequiresReview ||
    hasConflictingFacts ||
    hasUnspecifiedFacts ||
    hasLowConfidence ||
    hasDroppedFacts ||
    dedupedReasons.length > 0;

  return {
    lawyer_review,
    lawyer_review_reasons: dedupedReasons,
  };
}

export function evaluateRiskRules(
  clauses: ClauseWithFacts[],
  playbook: PlaybookPreferences,
): Finding[] {
  const aggregated = aggregateClauseFacts(clauses);
  const ctx: RuleEvaluationContext = { clauses, playbook, aggregated };
  const findings: Finding[] = [];

  // 1. PAY-1 (playbook): days_to_pay > playbook.max_days_to_pay
  {
    const payAgg = ctx.aggregated.payment;
    const maxDays = playbook.payment_terms.max_days_to_pay;

    if (payAgg.days_to_pay.state === "single") {
      const days = payAgg.days_to_pay.value;
      if (days > maxDays) {
        const severity = days >= 2 * maxDays ? "high" : "medium";
        const supportingClauses = [...payAgg.days_to_pay.clauses];
        const trigger = payAgg.payment_trigger.state === "single" ? payAgg.payment_trigger.value : null;

        const params: Record<string, unknown> = {
          days_to_pay: days,
          playbook_max_days: maxDays,
          diff: days - maxDays,
        };

        if (trigger === "acceptance" || trigger === "delivery_and_acceptance") {
          params.clock_starts_at = trigger;
        }

        if (payAgg.total_fee_amount.state === "single") {
          params.amount = payAgg.total_fee_amount.value;
          if (payAgg.currency.state === "single") {
            params.currency = payAgg.currency.value;
          }
          // When a consequence sentence with a fee amount is shown, its source clause evidence (the fee) must be included too.
          for (const feeClause of payAgg.total_fee_amount.clauses) {
            if (!supportingClauses.some((sc) => sc.id === feeClause.id)) {
              supportingClauses.push(feeClause);
            }
          }
        }

        const review = evaluateLawyerReview(
          supportingClauses,
          false,
          false,
          false,
        );

        findings.push({
          rule_id: "PAY-1",
          rule_version: RISK_RULES_VERSION,
          source: "playbook",
          severity,
          priority: SEVERITY_PRIORITY_WEIGHTS[severity],
          clause_ids: supportingClauses.map((c) => c.id),
          evidence: buildEvidenceForClauses(supportingClauses),
          params,
          lawyer_review: review.lawyer_review,
          lawyer_review_reasons: review.lawyer_review_reasons,
        });
      }
    } else if (payAgg.days_to_pay.state === "conflicting") {
      const anyViolates = payAgg.days_to_pay.values.some((d) => d > maxDays);
      if (anyViolates) {
        const maxViolating = Math.max(...payAgg.days_to_pay.values.filter((d) => d > maxDays));
        const severity = maxViolating >= 2 * maxDays ? "high" : "medium";
        const supportingClauses = [...payAgg.days_to_pay.clauses];
        const params: Record<string, unknown> = {
          days_to_pay: maxViolating,
          playbook_max_days: maxDays,
          diff: maxViolating - maxDays,
          conflicting_values: payAgg.days_to_pay.values,
        };

        if (payAgg.total_fee_amount.state === "single") {
          params.amount = payAgg.total_fee_amount.value;
          if (payAgg.currency.state === "single") {
            params.currency = payAgg.currency.value;
          }
          for (const feeClause of payAgg.total_fee_amount.clauses) {
            if (!supportingClauses.some((sc) => sc.id === feeClause.id)) {
              supportingClauses.push(feeClause);
            }
          }
        }

        const review = evaluateLawyerReview(
          supportingClauses,
          false,
          true,
          false,
        );

        findings.push({
          rule_id: "PAY-1",
          rule_version: RISK_RULES_VERSION,
          source: "playbook",
          severity,
          priority: SEVERITY_PRIORITY_WEIGHTS[severity],
          clause_ids: supportingClauses.map((c) => c.id),
          evidence: buildEvidenceForClauses(supportingClauses),
          params,
          lawyer_review: review.lawyer_review,
          lawyer_review_reasons: review.lawyer_review_reasons,
        });
      }
    }
  }

  // 2. PAY-2 (builtin): payment_trigger in [acceptance, delivery_and_acceptance] OR client_may_withhold = yes
  {
    const payAgg = ctx.aggregated.payment;
    const trigger = payAgg.payment_trigger.state === "single" ? payAgg.payment_trigger.value : null;
    const withhold = payAgg.client_may_withhold.state === "single" ? payAgg.client_may_withhold.value : null;

    const isTriggerMatch = trigger === "acceptance" || trigger === "delivery_and_acceptance";
    const isWithholdMatch = withhold === "for_unaccepted_work";

    if (isTriggerMatch || isWithholdMatch) {
      const supportingClauses = Array.from(
        new Set([
          ...(isTriggerMatch ? payAgg.payment_trigger.clauses : []),
          ...(isWithholdMatch ? payAgg.client_may_withhold.clauses : []),
        ]),
      );

      const review = evaluateLawyerReview(
        supportingClauses,
        false,
        payAgg.payment_trigger.state === "conflicting" || payAgg.client_may_withhold.state === "conflicting",
        false,
      );

      findings.push({
        rule_id: "PAY-2",
        rule_version: RISK_RULES_VERSION,
        source: "builtin",
        severity: "medium",
        priority: SEVERITY_PRIORITY_WEIGHTS.medium,
        clause_ids: supportingClauses.map((c) => c.id),
        evidence: buildEvidenceForClauses(supportingClauses),
        params: {
          payment_trigger: trigger,
          client_may_withhold: withhold,
        },
        lawyer_review: review.lawyer_review,
        lawyer_review_reasons: review.lawyer_review_reasons,
      });
    }
  }

  // 3. PAY-3 (builtin): no payment clause, or days_to_pay unspecified: low + lawyer review
  {
    const payAgg = ctx.aggregated.payment;
    const noClauses = payAgg.clauses.length === 0;
    const unspecifiedDays = !noClauses && payAgg.days_to_pay.state === "unspecified";

    if (noClauses || unspecifiedDays) {
      const supportingClauses = payAgg.clauses;
      const reviewReason = noClauses ? "no_payment_clause" : "unspecified_days_to_pay";

      const review = evaluateLawyerReview(
        supportingClauses,
        true,
        false,
        unspecifiedDays,
        [reviewReason],
      );

      findings.push({
        rule_id: "PAY-3",
        rule_version: RISK_RULES_VERSION,
        source: "builtin",
        severity: "low",
        priority: SEVERITY_PRIORITY_WEIGHTS.low,
        clause_ids: supportingClauses.map((c) => c.id),
        evidence: buildEvidenceForClauses(supportingClauses),
        params: {
          reason: reviewReason,
        },
        lawyer_review: review.lawyer_review,
        lawyer_review_reasons: review.lawyer_review_reasons,
      });
    }
  }

  // 4. LIAB-1 (playbook): require_cap and contractor_liability = unlimited: high;
  // capped with cap_multiple_of_fees > max_multiple_of_fees: medium;
  // unspecified or no liability clause while require_cap: medium + lawyer review.
  {
    const liabCap = playbook.liability_cap;
    if (liabCap.require_cap) {
      const liabAgg = ctx.aggregated.liability;
      const noLiabilityClause = liabAgg.clauses.length === 0;
      const unspecifiedLiability = !noLiabilityClause && liabAgg.contractor_liability.state === "unspecified";

      if (noLiabilityClause || unspecifiedLiability) {
        const supportingClauses = liabAgg.clauses;
        const reviewReason = noLiabilityClause ? "no_liability_clause" : "unspecified_liability_cap";
        const review = evaluateLawyerReview(
          supportingClauses,
          true,
          false,
          true,
          [reviewReason],
        );

        findings.push({
          rule_id: "LIAB-1",
          rule_version: RISK_RULES_VERSION,
          source: "playbook",
          severity: "medium",
          priority: SEVERITY_PRIORITY_WEIGHTS.medium,
          clause_ids: supportingClauses.map((c) => c.id),
          evidence: buildEvidenceForClauses(supportingClauses),
          params: {
            contractor_liability: "unspecified",
            require_cap: true,
            reason: reviewReason,
          },
          lawyer_review: review.lawyer_review,
          lawyer_review_reasons: review.lawyer_review_reasons,
        });
      } else if (
        liabAgg.contractor_liability.state === "single" &&
        liabAgg.contractor_liability.value === "unlimited"
      ) {
        const supportingClauses = liabAgg.contractor_liability.clauses;
        const review = evaluateLawyerReview(
          supportingClauses,
          false,
          false,
          false,
        );

        findings.push({
          rule_id: "LIAB-1",
          rule_version: RISK_RULES_VERSION,
          source: "playbook",
          severity: "high",
          priority: SEVERITY_PRIORITY_WEIGHTS.high,
          clause_ids: supportingClauses.map((c) => c.id),
          evidence: buildEvidenceForClauses(supportingClauses),
          params: {
            contractor_liability: "unlimited",
            require_cap: true,
          },
          lawyer_review: review.lawyer_review,
          lawyer_review_reasons: review.lawyer_review_reasons,
        });
      } else if (
        liabAgg.contractor_liability.state === "single" &&
        liabAgg.contractor_liability.value === "capped"
      ) {
        const maxMultiple = liabCap.max_multiple_of_fees;

        if (liabAgg.cap_multiple_of_fees.state === "single") {
          const capMult = liabAgg.cap_multiple_of_fees.value;
          if (capMult > maxMultiple) {
            const supportingClauses = Array.from(
              new Set([
                ...liabAgg.contractor_liability.clauses,
                ...liabAgg.cap_multiple_of_fees.clauses,
              ]),
            );
            const review = evaluateLawyerReview(
              supportingClauses,
              false,
              false,
              false,
            );

            findings.push({
              rule_id: "LIAB-1",
              rule_version: RISK_RULES_VERSION,
              source: "playbook",
              severity: "medium",
              priority: SEVERITY_PRIORITY_WEIGHTS.medium,
              clause_ids: supportingClauses.map((c) => c.id),
              evidence: buildEvidenceForClauses(supportingClauses),
              params: {
                contractor_liability: "capped",
                cap_multiple_of_fees: capMult,
                max_multiple_of_fees: maxMultiple,
                require_cap: true,
              },
              lawyer_review: review.lawyer_review,
              lawyer_review_reasons: review.lawyer_review_reasons,
            });
          }
        } else if (liabAgg.cap_multiple_of_fees.state === "conflicting") {
          const anyExceeds = liabAgg.cap_multiple_of_fees.values.some((m) => m > maxMultiple);
          if (anyExceeds) {
            const maxVal = Math.max(...liabAgg.cap_multiple_of_fees.values.filter((m) => m > maxMultiple));
            const supportingClauses = Array.from(
              new Set([
                ...liabAgg.contractor_liability.clauses,
                ...liabAgg.cap_multiple_of_fees.clauses,
              ]),
            );
            const review = evaluateLawyerReview(
              supportingClauses,
              false,
              true,
              false,
            );

            findings.push({
              rule_id: "LIAB-1",
              rule_version: RISK_RULES_VERSION,
              source: "playbook",
              severity: "medium",
              priority: SEVERITY_PRIORITY_WEIGHTS.medium,
              clause_ids: supportingClauses.map((c) => c.id),
              evidence: buildEvidenceForClauses(supportingClauses),
              params: {
                contractor_liability: "capped",
                cap_multiple_of_fees: maxVal,
                max_multiple_of_fees: maxMultiple,
                require_cap: true,
              },
              lawyer_review: review.lawyer_review,
              lawyer_review_reasons: review.lawyer_review_reasons,
            });
          }
        } else if (liabAgg.cap_multiple_of_fees.state === "unspecified") {
          const supportingClauses = liabAgg.contractor_liability.clauses;
          const review = evaluateLawyerReview(
            supportingClauses,
            true,
            false,
            true,
            ["unspecified_liability_cap_multiple"],
          );

          findings.push({
            rule_id: "LIAB-1",
            rule_version: RISK_RULES_VERSION,
            source: "playbook",
            severity: "medium",
            priority: SEVERITY_PRIORITY_WEIGHTS.medium,
            clause_ids: supportingClauses.map((c) => c.id),
            evidence: buildEvidenceForClauses(supportingClauses),
            params: {
              contractor_liability: "capped",
              cap_multiple_of_fees: null,
              max_multiple_of_fees: maxMultiple,
              require_cap: true,
              reason: "unspecified_liability_cap_multiple",
            },
            lawyer_review: review.lawyer_review,
            lawyer_review_reasons: review.lawyer_review_reasons,
          });
        }
      }
    }
  }

  // 5. IP-1 (playbook): vs ip_ownership
  // "transfer_after_full_payment" and transfer_timing = on_creation: high; on_delivery: medium;
  // "license_only" and any transfer: high;
  // "transfer_on_delivery" and on_creation: low;
  // "no_requirement": no finding.
  // conditional_on_payment = no counts like on_creation.
  {
    const ipPref = playbook.ip_ownership;
    if (ipPref !== "no_requirement") {
      const ipAgg = ctx.aggregated.ip_ownership;

      if (ipAgg.clauses.length > 0) {
        const computeTimingSeverity = (timing: string): "low" | "medium" | "high" | null => {
          if (ipPref === "transfer_after_full_payment") {
            if (timing === "on_creation") return "high";
            if (timing === "on_delivery") return "medium";
          } else if (ipPref === "license_only") {
            if (
              timing === "on_creation" ||
              timing === "on_delivery" ||
              timing === "on_full_payment"
            ) {
              return "high";
            }
          } else if (ipPref === "transfer_on_delivery") {
            if (timing === "on_creation") return "low";
          }
          return null;
        };

        const rank = (s: "low" | "medium" | "high" | null): number =>
          s === "high" ? 3 : s === "medium" ? 2 : s === "low" ? 1 : 0;

        let effectiveTiming: string | null = null;
        let isConflicting = false;
        let isUnspecified = false;
        let severity: "low" | "medium" | "high" | null = null;

        const condPay = ipAgg.conditional_on_payment.state === "single" ? ipAgg.conditional_on_payment.value : null;

        if (ipAgg.transfer_timing.state === "conflicting") {
          isConflicting = true;
          const distinct = Array.from(new Set(ipAgg.transfer_timing.values));
          distinct.sort((a, b) => {
            const diff = rank(computeTimingSeverity(b)) - rank(computeTimingSeverity(a));
            if (diff !== 0) return diff;
            return a.localeCompare(b);
          });
          effectiveTiming = distinct[0];
          severity = computeTimingSeverity(distinct[0]);
        } else if (condPay === "no") {
          effectiveTiming = "on_creation";
          severity = computeTimingSeverity("on_creation");
        } else if (ipAgg.transfer_timing.state === "single") {
          effectiveTiming = ipAgg.transfer_timing.value;
          severity = computeTimingSeverity(effectiveTiming);
        } else {
          isUnspecified = true;
        }

        if (severity) {
          const supportingClauses = Array.from(
            new Set([
              ...ipAgg.transfer_timing.clauses,
              ...(condPay === "no" ? ipAgg.conditional_on_payment.clauses : []),
            ]),
          );
          supportingClauses.sort((a, b) => {
            if (a.page_number !== b.page_number) return a.page_number - b.page_number;
            if ((a.char_start ?? 0) !== (b.char_start ?? 0)) return (a.char_start ?? 0) - (b.char_start ?? 0);
            return a.id.localeCompare(b.id);
          });

          const review = evaluateLawyerReview(
            supportingClauses,
            false,
            isConflicting,
            isUnspecified,
          );

          findings.push({
            rule_id: "IP-1",
            rule_version: RISK_RULES_VERSION,
            source: "playbook",
            severity,
            priority: SEVERITY_PRIORITY_WEIGHTS[severity],
            clause_ids: supportingClauses.map((c) => c.id),
            evidence: buildEvidenceForClauses(supportingClauses),
            params: {
              playbook_preference: ipPref,
              transfer_timing: effectiveTiming,
              conditional_on_payment: condPay,
            },
            lawyer_review: review.lawyer_review,
            lawyer_review_reasons: review.lawyer_review_reasons,
          });
        }
      }
    }
  }

  // 6. TERM-1 (playbook): client_convenience_termination = yes and notice_days < min_notice_days:
  // high when notice_days = 0, otherwise medium.
  {
    const termAgg = ctx.aggregated.termination;
    const minNotice = playbook.termination.min_notice_days;

    if (termAgg.clauses.length > 0) {
      const convTerm = termAgg.client_convenience_termination.state === "single"
        ? termAgg.client_convenience_termination.value
        : null;

      if (convTerm === "yes") {
        if (termAgg.notice_days.state === "single") {
          const days = termAgg.notice_days.value;
          if (days < minNotice) {
            const severity = days === 0 ? "high" : "medium";
            const supportingClauses = Array.from(
              new Set([
                ...termAgg.client_convenience_termination.clauses,
                ...termAgg.notice_days.clauses,
              ]),
            );
            const review = evaluateLawyerReview(
              supportingClauses,
              false,
              false,
              false,
            );

            findings.push({
              rule_id: "TERM-1",
              rule_version: RISK_RULES_VERSION,
              source: "playbook",
              severity,
              priority: SEVERITY_PRIORITY_WEIGHTS[severity],
              clause_ids: supportingClauses.map((c) => c.id),
              evidence: buildEvidenceForClauses(supportingClauses),
              params: {
                notice_days: days,
                min_notice_days: minNotice,
                diff: minNotice - days,
              },
              lawyer_review: review.lawyer_review,
              lawyer_review_reasons: review.lawyer_review_reasons,
            });
          }
        } else if (termAgg.notice_days.state === "conflicting") {
          const minContractDays = Math.min(...termAgg.notice_days.values);
          if (minContractDays < minNotice) {
            const severity = minContractDays === 0 ? "high" : "medium";
            const supportingClauses = Array.from(
              new Set([
                ...termAgg.client_convenience_termination.clauses,
                ...termAgg.notice_days.clauses,
              ]),
            );
            const review = evaluateLawyerReview(
              supportingClauses,
              false,
              true,
              false,
            );

            findings.push({
              rule_id: "TERM-1",
              rule_version: RISK_RULES_VERSION,
              source: "playbook",
              severity,
              priority: SEVERITY_PRIORITY_WEIGHTS[severity],
              clause_ids: supportingClauses.map((c) => c.id),
              evidence: buildEvidenceForClauses(supportingClauses),
              params: {
                notice_days: minContractDays,
                min_notice_days: minNotice,
                diff: minNotice - minContractDays,
              },
              lawyer_review: review.lawyer_review,
              lawyer_review_reasons: review.lawyer_review_reasons,
            });
          }
        }
      }
    }
  }

  // 7. TERM-2 (playbook): pay_for_work_done = true and payment_for_work_done in [none, only_invoiced]:
  // high for none, medium for only_invoiced.
  {
    if (playbook.termination.pay_for_work_done) {
      const termAgg = ctx.aggregated.termination;
      if (termAgg.clauses.length > 0) {
        const payWork = termAgg.payment_for_work_done.state === "single"
          ? termAgg.payment_for_work_done.value
          : null;

        if (payWork === "none" || payWork === "only_invoiced") {
          const severity = payWork === "none" ? "high" : "medium";
          const supportingClauses = Array.from(
            new Set([
              ...termAgg.client_convenience_termination.clauses,
              ...termAgg.payment_for_work_done.clauses,
            ]),
          );
          const review = evaluateLawyerReview(
            supportingClauses,
            false,
            false,
            false,
          );

          findings.push({
            rule_id: "TERM-2",
            rule_version: RISK_RULES_VERSION,
            source: "playbook",
            severity,
            priority: SEVERITY_PRIORITY_WEIGHTS[severity],
            clause_ids: supportingClauses.map((c) => c.id),
            evidence: buildEvidenceForClauses(supportingClauses),
            params: {
              payment_for_work_done: payWork,
              require_pay_work_done: true,
            },
            lawyer_review: review.lawyer_review,
            lawyer_review_reasons: review.lawyer_review_reasons,
          });
        }
      }
    }
  }

  // 8. SCOPE-1 (playbook): require_written_change_order and
  // (written_change_order_required = no OR extra_work_without_additional_fee = yes):
  // high if both, else medium.
  {
    if (playbook.scope_changes.require_written_change_order) {
      const scopeAgg = ctx.aggregated.scope_change;
      if (scopeAgg.clauses.length > 0) {
        const writtenReq = scopeAgg.written_change_order_required.state === "single"
          ? scopeAgg.written_change_order_required.value
          : null;
        const extraWork = scopeAgg.extra_work_without_additional_fee.state === "single"
          ? scopeAgg.extra_work_without_additional_fee.value
          : null;

        const condNoOrder = writtenReq === "no";
        const condExtraFree = extraWork === "yes";

        if (condNoOrder || condExtraFree) {
          const severity = condNoOrder && condExtraFree ? "high" : "medium";
          const supportingClauses = scopeAgg.clauses;
          const review = evaluateLawyerReview(
            supportingClauses,
            false,
            scopeAgg.written_change_order_required.state === "conflicting" ||
              scopeAgg.extra_work_without_additional_fee.state === "conflicting",
            false,
          );

          findings.push({
            rule_id: "SCOPE-1",
            rule_version: RISK_RULES_VERSION,
            source: "playbook",
            severity,
            priority: SEVERITY_PRIORITY_WEIGHTS[severity],
            clause_ids: supportingClauses.map((c) => c.id),
            evidence: buildEvidenceForClauses(supportingClauses),
            params: {
              written_change_order_required: writtenReq,
              extra_work_without_additional_fee: extraWork,
              require_written_change_order: true,
            },
            lawyer_review: review.lawyer_review,
            lawyer_review_reasons: review.lawyer_review_reasons,
          });
        }
      }
    }
  }

  // 9. LAW-1 (builtin): foreign_to_bangladesh = yes: medium + lawyer review (cost, forum and enforceability uncertainty).
  // dispute_forum = arbitration with a seat outside Bangladesh adds a parameter, not a new finding.
  {
    const lawAgg = ctx.aggregated.governing_law;
    if (lawAgg.clauses.length > 0) {
      const foreign = lawAgg.foreign_to_bangladesh.state === "single"
        ? lawAgg.foreign_to_bangladesh.value
        : null;

      if (foreign === "yes") {
        const supportingClauses = lawAgg.clauses;
        const lawName = lawAgg.governing_law_name.state === "single"
          ? lawAgg.governing_law_name.value
          : null;
        const forum = lawAgg.dispute_forum.state === "single"
          ? lawAgg.dispute_forum.value
          : null;
        const seat = lawAgg.seat.state === "single"
          ? lawAgg.seat.value
          : null;

        const params: Record<string, unknown> = {
          foreign_to_bangladesh: "yes",
          governing_law_name: lawName,
        };

        if (forum === "arbitration") {
          params.dispute_forum = "arbitration";
          if (seat && !/bangladesh|dhaka/i.test(seat)) {
            params.seat = seat;
            params.arbitration_foreign_seat = true;
          }
        }

        const review = evaluateLawyerReview(
          supportingClauses,
          true,
          lawAgg.foreign_to_bangladesh.state === "conflicting",
          false,
          ["foreign_governing_law_uncertainty"],
        );

        findings.push({
          rule_id: "LAW-1",
          rule_version: RISK_RULES_VERSION,
          source: "builtin",
          severity: "medium",
          priority: SEVERITY_PRIORITY_WEIGHTS.medium,
          clause_ids: supportingClauses.map((c) => c.id),
          evidence: buildEvidenceForClauses(supportingClauses),
          params,
          lawyer_review: review.lawyer_review,
          lawyer_review_reasons: review.lawyer_review_reasons,
        });
      }
    }
  }

  // 10. IND-1 (builtin): indemnifying_party = contractor and scope = broad: high.
  {
    const indAgg = ctx.aggregated.indemnity;
    if (indAgg.clauses.length > 0) {
      const party = indAgg.indemnifying_party.state === "single"
        ? indAgg.indemnifying_party.value
        : null;
      const scope = indAgg.scope.state === "single"
        ? indAgg.scope.value
        : null;

      if (party === "contractor" && scope === "broad") {
        const supportingClauses = indAgg.clauses;
        const review = evaluateLawyerReview(
          supportingClauses,
          false,
          indAgg.indemnifying_party.state === "conflicting" || indAgg.scope.state === "conflicting",
          false,
        );

        findings.push({
          rule_id: "IND-1",
          rule_version: RISK_RULES_VERSION,
          source: "builtin",
          severity: "high",
          priority: SEVERITY_PRIORITY_WEIGHTS.high,
          clause_ids: supportingClauses.map((c) => c.id),
          evidence: buildEvidenceForClauses(supportingClauses),
          params: {
            indemnifying_party: party,
            scope: scope,
            references_defined_losses: indAgg.references_defined_losses.state === "single"
              ? indAgg.references_defined_losses.value
              : null,
          },
          lawyer_review: review.lawyer_review,
          lawyer_review_reasons: review.lawyer_review_reasons,
        });
      }
    }
  }

  // 11. DEF-1 (builtin): a definition with includes_indirect_or_consequential_losses = yes: medium.
  {
    const defClauses = ctx.clauses.filter(
      (c) =>
        c.clause_type === "definition" &&
        c.facts &&
        c.facts.includes_indirect_or_consequential_losses === "yes",
    );

    if (defClauses.length > 0) {
      const supportingClauses = defClauses;
      const definedTerm = typeof defClauses[0].facts?.defined_term === "string"
        ? defClauses[0].facts.defined_term
        : null;

      const review = evaluateLawyerReview(
        supportingClauses,
        false,
        false,
        false,
      );

      findings.push({
        rule_id: "DEF-1",
        rule_version: RISK_RULES_VERSION,
        source: "builtin",
        severity: "medium",
        priority: SEVERITY_PRIORITY_WEIGHTS.medium,
        clause_ids: supportingClauses.map((c) => c.id),
        evidence: buildEvidenceForClauses(supportingClauses),
        params: {
          includes_indirect_or_consequential_losses: "yes",
          defined_term: definedTerm,
        },
        lawyer_review: review.lawyer_review,
        lawyer_review_reasons: review.lawyer_review_reasons,
      });
    }
  }

  // Ordering: priority desc, then canonical rule order
  const ruleOrderMap = new Map<RuleId, number>(
    REGISTERED_RULE_IDS.map((id, index) => [id, index]),
  );

  findings.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    const orderA = ruleOrderMap.get(a.rule_id) ?? 999;
    const orderB = ruleOrderMap.get(b.rule_id) ?? 999;
    return orderA - orderB;
  });

  return findings;
}

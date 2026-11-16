# Chukti AI Risk Rules Reference

**Version:** `v4` (`FACTS_PROMPT_VERSION = "v4"`, `RISK_RULES_VERSION = "v4"`)

This document catalogs every deterministic risk rule evaluated by the Chukti AI rule engine (`lib/risk/engine.ts`).
Findings are computed solely by deterministic TypeScript functions comparing verified facts against the user's playbook. The LLM extracts facts; it never assigns severities, priority scores, or judgments.

## Rules Table

| ID | Source | Condition | Severity Logic |
| :--- | :--- | :--- | :--- |
| `PAY-1` | playbook | `days_to_pay > playbook.payment_terms.max_days_to_pay` | `high` if `days_to_pay >= 2 * max_days_to_pay`, otherwise `medium`. If payment trigger is `acceptance` or `delivery_and_acceptance`, records clock start. When fee amount consequence is displayed, includes the fee clause evidence. |
| `PAY-2` | builtin | `payment_trigger in [acceptance, delivery_and_acceptance] OR client_may_withhold = for_unaccepted_work` | `medium`. Protects against delayed payment triggers and unilateral client withholding for unaccepted work. Does NOT fire for `disputed_portion_only`, `no`, or `unspecified`. |
| `PAY-3` | builtin | No payment clause present in contract, OR `days_to_pay` unspecified | `low` + flagged for lawyer review due to missing or unspecified payment timeline. |
| `LIAB-1` | playbook | `require_cap = true` AND (`contractor_liability = unlimited` OR `cap_multiple_of_fees > max_multiple_of_fees` OR liability clause/cap unspecified) | `high` for unlimited contractor liability; `medium` if capped with multiple exceeding playbook; `medium` + lawyer review if liability clause missing or cap unspecified. Rule does not fire if `require_cap = false`. |
| `IP-1` | playbook | Intellectual property transfer terms vs `playbook.ip_ownership` preference | If `transfer_after_full_payment`: `high` for `on_creation`, `medium` for `on_delivery`. If `license_only`: `high` for any assignment (`on_creation`, `on_delivery`, `on_full_payment`). If `transfer_on_delivery`: `low` for `on_creation`. Note: `conditional_on_payment = no` counts like `on_creation`. When conflicting transfer timing facts exist, `conditional_on_payment = no` is considered alongside them. `no_requirement` yields no finding. Supporting evidence trimmed to the violating transfer/payment clause. |
| `TERM-1` | playbook | `client_convenience_termination = yes AND notice_days < min_notice_days` | `high` when `notice_days = 0` (immediate termination without notice), otherwise `medium`. Evidence trimmed to the convenience termination and notice clauses. |
| `TERM-2` | playbook | `pay_for_work_done = true AND payment_for_work_done in [none, only_invoiced]` | `high` if contractor receives no payment (`none`), `medium` if contractor only receives payment for previously invoiced work (`only_invoiced`). Evidence trimmed to the convenience termination and payment-for-work clauses only. |
| `SCOPE-1` | playbook | `require_written_change_order = true` AND (`written_change_order_required = no` OR `extra_work_without_additional_fee = yes`) | `high` if both conditions are violated, otherwise `medium`. Protects freelancers against unpaid scope creep. |
| `LAW-1` | builtin | `foreign_to_bangladesh = yes` | `medium` + flagged for lawyer review (cross-border jurisdiction, forum cost, and local enforceability uncertainty). If dispute forum is arbitration with foreign seat, adds seat parameter. |
| `IND-1` | builtin | `indemnifying_party = contractor AND scope = broad` | `high`. Protects contractor against one-sided, open-ended indemnity obligations. |
| `DEF-1` | builtin | A definition clause with `includes_indirect_or_consequential_losses = yes` | `medium`. Protects contractor from expansive defined losses including consequential or indirect damages. |
| `ACC-1` | builtin | `acceptance_decider = client_sole AND (payment_tied_to_acceptance = yes OR a payment clause exists)` | `high`. Protects contractor against unilateral, subjective client acceptance determining when or if payment is made. Evidence includes the acceptance clause quote (and payment clause quote if used). Does not fire for `mutual_or_objective`. |
| `COMBO-1` | builtin | `IP-1 fired with transfer on signing/delivery or not conditional on payment, AND PAY-1 fired (long payment term)` | `critical` + flagged for lawyer review. Evidence: one quote from each clause. Lists combined source rules (`["IP-1", "PAY-1"]`) and shows contract's own payment days. Supplements individual findings. |
| `COMBO-2` | builtin | `IP transfers to client AND client can terminate for convenience without paying for work done (payment_for_work_done in [none, only_invoiced])` | `high` + flagged for lawyer review. Evidence: one quote from each clause. Lists combined source rules and shows contract's notice days and payment-for-work status. Supplements individual findings. |

## Severity and Priority Weights

Severity and priority are prioritization aids to help users review contracts, never legal probabilities.

- `critical`: 90
- `high`: 60
- `medium`: 30
- `low`: 10

## Lawyer Review Requirements

A finding automatically requires lawyer review (`lawyer_review = true`) when:
1. The rule explicitly mandates lawyer review (e.g., `PAY-3`, `LAW-1`, `LIAB-1` when cap is unspecified).
2. A fact the rule depends on is conflicting between multiple clauses or unspecified.
3. Any supporting clause has low model extraction confidence (`extraction_confidence = "low"`).
4. The facts for a supporting clause were dropped due to evidence quote mismatch (`facts_verified = false`).

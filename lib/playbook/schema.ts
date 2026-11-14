import { z } from "zod";

export const IP_OWNERSHIP_OPTIONS = [
  "transfer_after_full_payment",
  "transfer_on_delivery",
  "license_only",
  "no_requirement",
] as const;

export type IpOwnershipOption = (typeof IP_OWNERSHIP_OPTIONS)[number];

export const DEFAULT_PLAYBOOK = {
  liability_cap: {
    require_cap: true,
    max_multiple_of_fees: 1,
  },
  payment_terms: {
    max_days_to_pay: 30,
  },
  ip_ownership: "transfer_after_full_payment" as IpOwnershipOption,
  termination: {
    min_notice_days: 14,
    pay_for_work_done: true,
  },
  scope_changes: {
    require_written_change_order: true,
  },
} as const;

const liabilityCapSchema = z
  .object({
    require_cap: z
      .boolean({ message: "require_cap must be a boolean." })
      .default(DEFAULT_PLAYBOOK.liability_cap.require_cap),
    max_multiple_of_fees: z
      .number({ message: "max_multiple_of_fees must be a number." })
      .finite("max_multiple_of_fees must be a finite number.")
      .min(0.5, "max_multiple_of_fees must be at least 0.5.")
      .max(10, "max_multiple_of_fees must be at most 10.")
      .default(DEFAULT_PLAYBOOK.liability_cap.max_multiple_of_fees),
  })
  .strict();

const paymentTermsSchema = z
  .object({
    max_days_to_pay: z
      .number({ message: "max_days_to_pay must be an integer." })
      .int("max_days_to_pay must be a whole number of days.")
      .min(1, "max_days_to_pay must be at least 1 day.")
      .max(120, "max_days_to_pay must be at most 120 days.")
      .default(DEFAULT_PLAYBOOK.payment_terms.max_days_to_pay),
  })
  .strict();

const ipOwnershipSchema = z
  .enum(IP_OWNERSHIP_OPTIONS, {
    message:
      "ip_ownership must be one of: transfer_after_full_payment, transfer_on_delivery, license_only, no_requirement.",
  })
  .default(DEFAULT_PLAYBOOK.ip_ownership);

const terminationSchema = z
  .object({
    min_notice_days: z
      .number({ message: "min_notice_days must be an integer." })
      .int("min_notice_days must be a whole number of days.")
      .min(0, "min_notice_days must be at least 0 days.")
      .max(90, "min_notice_days must be at most 90 days.")
      .default(DEFAULT_PLAYBOOK.termination.min_notice_days),
    pay_for_work_done: z
      .boolean({ message: "pay_for_work_done must be a boolean." })
      .default(DEFAULT_PLAYBOOK.termination.pay_for_work_done),
  })
  .strict();

const scopeChangesSchema = z
  .object({
    require_written_change_order: z
      .boolean({ message: "require_written_change_order must be a boolean." })
      .default(DEFAULT_PLAYBOOK.scope_changes.require_written_change_order),
  })
  .strict();

export const playbookSchema = z
  .object({
    liability_cap: liabilityCapSchema.default({ ...DEFAULT_PLAYBOOK.liability_cap }),
    payment_terms: paymentTermsSchema.default({ ...DEFAULT_PLAYBOOK.payment_terms }),
    ip_ownership: ipOwnershipSchema,
    termination: terminationSchema.default({ ...DEFAULT_PLAYBOOK.termination }),
    scope_changes: scopeChangesSchema.default({ ...DEFAULT_PLAYBOOK.scope_changes }),
  })
  .strict();

export type PlaybookPreferences = z.infer<typeof playbookSchema>;

export function cloneDefaultPlaybook(): PlaybookPreferences {
  return {
    liability_cap: { ...DEFAULT_PLAYBOOK.liability_cap },
    payment_terms: { ...DEFAULT_PLAYBOOK.payment_terms },
    ip_ownership: DEFAULT_PLAYBOOK.ip_ownership,
    termination: { ...DEFAULT_PLAYBOOK.termination },
    scope_changes: { ...DEFAULT_PLAYBOOK.scope_changes },
  };
}

/**
 * Converts Zod validation issues into a field-keyed map (e.g. "payment_terms.max_days_to_pay").
 */
export function formatPlaybookFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key =
      issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join(".")
        : "playbook";
    if (!(key in fields)) {
      fields[key] = issue.message;
    }
  }
  return fields;
}

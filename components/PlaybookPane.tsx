"use client";

import type { Locale, Messages } from "@/lib/i18n";
import {
  IP_OWNERSHIP_OPTIONS,
  type IpOwnershipOption,
  type PlaybookPreferences,
} from "@/lib/playbook/schema";
import { getPlaybookFieldErrorMessage } from "@/lib/ui/messages";

export type PlaybookSaveStatus = "idle" | "saving" | "saved" | "error";
export type PlaybookErrorKind = "validation" | "failed" | null;

interface PlaybookPaneProps {
  messages: Messages["playbookPane"];
  locale: Locale;
  documentId: string | null;
  playbook: PlaybookPreferences;
  loading: boolean;
  loadError?: boolean;
  onRetryLoad?: () => void;
  saveStatus: PlaybookSaveStatus;
  hasServerSaved: boolean;
  isDirty: boolean;
  fieldErrors: Record<string, string>;
  playbookErrorKind: PlaybookErrorKind;
  onChange: (next: PlaybookPreferences) => void;
  onSave: () => void;
}

export function PlaybookPane({
  messages,
  locale,
  documentId,
  playbook,
  loading,
  loadError,
  onRetryLoad,
  saveStatus,
  hasServerSaved,
  isDirty,
  fieldErrors,
  playbookErrorKind,
  onChange,
  onSave,
}: PlaybookPaneProps) {
  const fields = messages.fields;

  const statusBadge = isDirty
    ? {
        label: messages.unsavedBadge,
        cls: "border-border-warning bg-surface-warning text-text-warning",
      }
    : hasServerSaved
      ? {
          label: messages.savedBadge,
          cls: "border-border-success bg-surface-success text-text-success",
        }
      : {
          label: messages.defaultsBadge,
          cls: "border-border-default bg-surface-subtle text-text-secondary",
        };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <section
      aria-label={messages.title}
      className="rounded-lg border border-border-default bg-surface-panel p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <h2 className="text-base font-semibold text-text-primary">{messages.title}</h2>
        <span
          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${statusBadge.cls}`}
        >
          {statusBadge.label}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-border-warning bg-surface-warning px-3 py-2 text-xs font-medium text-text-warning">
        {messages.starterNote}
      </div>

      {!documentId ? (
        <div className="mt-3 rounded-md border border-border-subtle bg-surface-subtle px-3 py-2.5 text-xs text-text-secondary">
          {messages.noDocumentNotice}
        </div>
      ) : null}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-md border border-border-subtle bg-surface-subtle p-4 text-sm text-text-secondary"
        >
          {messages.loadingState}
        </div>
      ) : (
        <>
          {loadError ? (
            <div
              role="alert"
              className="mt-4 rounded-md border border-border-danger bg-surface-danger p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-text-danger">
                  {messages.loadErrorTitle}
                </p>
                {onRetryLoad ? (
                  <button
                    type="button"
                    onClick={onRetryLoad}
                    className="rounded-md border border-border-danger bg-surface-panel px-3 py-1.5 text-xs font-semibold text-text-danger hover:bg-surface-subtle"
                  >
                    {messages.retryButton}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-4 space-y-5" noValidate>
            {/* 1. Liability cap */}
            <fieldset className="space-y-3 rounded-md border border-border-subtle bg-surface-canvas p-3.5">
              <legend className="px-1 text-sm font-semibold text-text-primary">
                {fields.liabilityCap.title}
              </legend>

              <div className="flex items-start gap-3">
                <input
                  id="playbook-require-cap"
                  type="checkbox"
                  checked={playbook.liability_cap.require_cap}
                  onChange={(event) =>
                    onChange({
                      ...playbook,
                      liability_cap: {
                        ...playbook.liability_cap,
                        require_cap: event.target.checked,
                      },
                    })
                  }
                  aria-describedby={
                    fieldErrors["liability_cap.require_cap"]
                      ? "playbook-require-cap-help playbook-require-cap-error"
                      : "playbook-require-cap-help"
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border-strong accent-accent-primary"
                />
                <div>
                  <label
                    htmlFor="playbook-require-cap"
                    className="block text-sm font-medium text-text-primary"
                  >
                    {fields.liabilityCap.requireLabel}
                  </label>
                  <p id="playbook-require-cap-help" className="mt-0.5 text-xs text-text-muted">
                    {fields.liabilityCap.requireHelp}
                  </p>
                  {fieldErrors["liability_cap.require_cap"] ? (
                    <p
                      id="playbook-require-cap-error"
                      className="mt-1 text-xs font-medium text-text-danger"
                      role="alert"
                    >
                      {getPlaybookFieldErrorMessage("liability_cap.require_cap", locale)}
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <label
                  htmlFor="playbook-max-multiple"
                  className="block text-sm font-medium text-text-primary"
                >
                  {fields.liabilityCap.multipleLabel}
                </label>
                <input
                  id="playbook-max-multiple"
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={10}
                  disabled={!playbook.liability_cap.require_cap}
                  value={
                    Number.isFinite(playbook.liability_cap.max_multiple_of_fees)
                      ? playbook.liability_cap.max_multiple_of_fees
                      : ""
                  }
                  onChange={(event) => {
                    const raw = event.target.value;
                    const num = raw === "" ? Number.NaN : Number(raw);
                    onChange({
                      ...playbook,
                      liability_cap: {
                        ...playbook.liability_cap,
                        max_multiple_of_fees: num,
                      },
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors["liability_cap.max_multiple_of_fees"])}
                  aria-describedby={
                    fieldErrors["liability_cap.max_multiple_of_fees"]
                      ? "playbook-max-multiple-help playbook-max-multiple-error"
                      : "playbook-max-multiple-help"
                  }
                  className="mt-1.5 w-full rounded-md border border-border-default bg-surface-panel px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-muted"
                />
                <p id="playbook-max-multiple-help" className="mt-1 text-xs text-text-muted">
                  {fields.liabilityCap.multipleHelp}
                </p>
                {fieldErrors["liability_cap.max_multiple_of_fees"] ? (
                  <p
                    id="playbook-max-multiple-error"
                    className="mt-1 text-xs font-medium text-text-danger"
                    role="alert"
                  >
                    {getPlaybookFieldErrorMessage("liability_cap.max_multiple_of_fees", locale)}
                  </p>
                ) : null}
              </div>
            </fieldset>

            {/* 2. Payment terms */}
            <fieldset className="space-y-2 rounded-md border border-border-subtle bg-surface-canvas p-3.5">
              <legend className="px-1 text-sm font-semibold text-text-primary">
                {fields.paymentTerms.title}
              </legend>
              <div>
                <label
                  htmlFor="playbook-max-days"
                  className="block text-sm font-medium text-text-primary"
                >
                  {fields.paymentTerms.maxDaysLabel}
                </label>
                <input
                  id="playbook-max-days"
                  type="number"
                  step={1}
                  min={1}
                  max={120}
                  value={
                    Number.isFinite(playbook.payment_terms.max_days_to_pay)
                      ? playbook.payment_terms.max_days_to_pay
                      : ""
                  }
                  onChange={(event) => {
                    const raw = event.target.value;
                    const num = raw === "" ? Number.NaN : Number(raw);
                    onChange({
                      ...playbook,
                      payment_terms: {
                        max_days_to_pay: num,
                      },
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors["payment_terms.max_days_to_pay"])}
                  aria-describedby={
                    fieldErrors["payment_terms.max_days_to_pay"]
                      ? "playbook-max-days-help playbook-max-days-error"
                      : "playbook-max-days-help"
                  }
                  className="mt-1.5 w-full rounded-md border border-border-default bg-surface-panel px-3 py-2 text-sm text-text-primary"
                />
                <p id="playbook-max-days-help" className="mt-1 text-xs text-text-muted">
                  {fields.paymentTerms.maxDaysHelp}
                </p>
                {fieldErrors["payment_terms.max_days_to_pay"] ? (
                  <p
                    id="playbook-max-days-error"
                    className="mt-1 text-xs font-medium text-text-danger"
                    role="alert"
                  >
                    {getPlaybookFieldErrorMessage("payment_terms.max_days_to_pay", locale)}
                  </p>
                ) : null}
              </div>
            </fieldset>

            {/* 3. IP ownership */}
            <fieldset className="space-y-2 rounded-md border border-border-subtle bg-surface-canvas p-3.5">
              <legend className="px-1 text-sm font-semibold text-text-primary">
                {fields.ipOwnership.title}
              </legend>
              <div>
                <label
                  htmlFor="playbook-ip-ownership"
                  className="block text-sm font-medium text-text-primary"
                >
                  {fields.ipOwnership.selectLabel}
                </label>
                <select
                  id="playbook-ip-ownership"
                  value={playbook.ip_ownership}
                  onChange={(event) =>
                    onChange({
                      ...playbook,
                      ip_ownership: event.target.value as IpOwnershipOption,
                    })
                  }
                  aria-invalid={Boolean(fieldErrors.ip_ownership)}
                  aria-describedby={
                    fieldErrors.ip_ownership
                      ? "playbook-ip-ownership-help playbook-ip-ownership-error"
                      : "playbook-ip-ownership-help"
                  }
                  className="mt-1.5 w-full rounded-md border border-border-default bg-surface-panel px-3 py-2 text-sm text-text-primary"
                >
                  {IP_OWNERSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {fields.ipOwnership.options[option]}
                    </option>
                  ))}
                </select>
                <p id="playbook-ip-ownership-help" className="mt-1 text-xs text-text-muted">
                  {fields.ipOwnership.selectHelp}
                </p>
                {fieldErrors.ip_ownership ? (
                  <p
                    id="playbook-ip-ownership-error"
                    className="mt-1 text-xs font-medium text-text-danger"
                    role="alert"
                  >
                    {getPlaybookFieldErrorMessage("ip_ownership", locale)}
                  </p>
                ) : null}
              </div>
            </fieldset>

            {/* 4. Termination */}
            <fieldset className="space-y-3 rounded-md border border-border-subtle bg-surface-canvas p-3.5">
              <legend className="px-1 text-sm font-semibold text-text-primary">
                {fields.termination.title}
              </legend>
              <div>
                <label
                  htmlFor="playbook-notice-days"
                  className="block text-sm font-medium text-text-primary"
                >
                  {fields.termination.noticeLabel}
                </label>
                <input
                  id="playbook-notice-days"
                  type="number"
                  step={1}
                  min={0}
                  max={90}
                  value={
                    Number.isFinite(playbook.termination.min_notice_days)
                      ? playbook.termination.min_notice_days
                      : ""
                  }
                  onChange={(event) => {
                    const raw = event.target.value;
                    const num = raw === "" ? Number.NaN : Number(raw);
                    onChange({
                      ...playbook,
                      termination: {
                        ...playbook.termination,
                        min_notice_days: num,
                      },
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors["termination.min_notice_days"])}
                  aria-describedby={
                    fieldErrors["termination.min_notice_days"]
                      ? "playbook-notice-days-help playbook-notice-days-error"
                      : "playbook-notice-days-help"
                  }
                  className="mt-1.5 w-full rounded-md border border-border-default bg-surface-panel px-3 py-2 text-sm text-text-primary"
                />
                <p id="playbook-notice-days-help" className="mt-1 text-xs text-text-muted">
                  {fields.termination.noticeHelp}
                </p>
                {fieldErrors["termination.min_notice_days"] ? (
                  <p
                    id="playbook-notice-days-error"
                    className="mt-1 text-xs font-medium text-text-danger"
                    role="alert"
                  >
                    {getPlaybookFieldErrorMessage("termination.min_notice_days", locale)}
                  </p>
                ) : null}
              </div>

              <div className="flex items-start gap-3">
                <input
                  id="playbook-pay-work-done"
                  type="checkbox"
                  checked={playbook.termination.pay_for_work_done}
                  onChange={(event) =>
                    onChange({
                      ...playbook,
                      termination: {
                        ...playbook.termination,
                        pay_for_work_done: event.target.checked,
                      },
                    })
                  }
                  aria-describedby={
                    fieldErrors["termination.pay_for_work_done"]
                      ? "playbook-pay-work-done-help playbook-pay-work-done-error"
                      : "playbook-pay-work-done-help"
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border-strong accent-accent-primary"
                />
                <div>
                  <label
                    htmlFor="playbook-pay-work-done"
                    className="block text-sm font-medium text-text-primary"
                  >
                    {fields.termination.payWorkDoneLabel}
                  </label>
                  <p id="playbook-pay-work-done-help" className="mt-0.5 text-xs text-text-muted">
                    {fields.termination.payWorkDoneHelp}
                  </p>
                  {fieldErrors["termination.pay_for_work_done"] ? (
                    <p
                      id="playbook-pay-work-done-error"
                      className="mt-1 text-xs font-medium text-text-danger"
                      role="alert"
                    >
                      {getPlaybookFieldErrorMessage("termination.pay_for_work_done", locale)}
                    </p>
                  ) : null}
                </div>
              </div>
            </fieldset>

            {/* 5. Scope changes */}
            <fieldset className="space-y-2 rounded-md border border-border-subtle bg-surface-canvas p-3.5">
              <legend className="px-1 text-sm font-semibold text-text-primary">
                {fields.scopeChanges.title}
              </legend>
              <div className="flex items-start gap-3">
                <input
                  id="playbook-written-change-order"
                  type="checkbox"
                  checked={playbook.scope_changes.require_written_change_order}
                  onChange={(event) =>
                    onChange({
                      ...playbook,
                      scope_changes: {
                        require_written_change_order: event.target.checked,
                      },
                    })
                  }
                  aria-describedby={
                    fieldErrors["scope_changes.require_written_change_order"]
                      ? "playbook-written-order-help playbook-written-order-error"
                      : "playbook-written-order-help"
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border-strong accent-accent-primary"
                />
                <div>
                  <label
                    htmlFor="playbook-written-change-order"
                    className="block text-sm font-medium text-text-primary"
                  >
                    {fields.scopeChanges.writtenOrderLabel}
                  </label>
                  <p id="playbook-written-order-help" className="mt-0.5 text-xs text-text-muted">
                    {fields.scopeChanges.writtenOrderHelp}
                  </p>
                  {fieldErrors["scope_changes.require_written_change_order"] ? (
                    <p
                      id="playbook-written-order-error"
                      className="mt-1 text-xs font-medium text-text-danger"
                      role="alert"
                    >
                      {getPlaybookFieldErrorMessage("scope_changes.require_written_change_order", locale)}
                    </p>
                  ) : null}
                </div>
              </div>
            </fieldset>

            {/* Save status messages */}
            {saveStatus === "error" ? (
              <div
                role="alert"
                className="rounded-md border border-border-danger bg-surface-danger px-3 py-2 text-xs font-medium text-text-danger"
              >
                {playbookErrorKind === "failed"
                  ? messages.saveFailed
                  : messages.saveErrorSummary}
              </div>
            ) : null}

            {saveStatus === "saved" && !isDirty ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-md border border-border-success bg-surface-success px-3 py-2 text-xs font-medium text-text-success"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{messages.saveSuccess}</span>
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
              <button
                type="submit"
                disabled={!documentId || loading || Boolean(loadError) || saveStatus === "saving"}
                className="w-full rounded-md bg-accent-primary px-4 py-2.5 text-sm font-semibold text-text-inverse hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:border disabled:border-border-default disabled:bg-surface-subtle disabled:text-text-secondary"
              >
                {saveStatus === "saving" ? messages.savingButton : messages.saveButton}
              </button>

              <div className="rounded-md border border-border-default bg-surface-subtle p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled
                    aria-describedby="analyze-not-implemented-note"
                    className="rounded-md border border-border-default bg-surface-panel px-3.5 py-2 text-sm font-semibold text-text-secondary disabled:cursor-not-allowed"
                  >
                    {messages.analyzeButton}
                  </button>
                  <span
                    id="analyze-not-implemented-note"
                    className="inline-flex items-center rounded border border-border-default bg-surface-panel px-2.5 py-1 text-xs font-medium text-text-secondary"
                  >
                    {messages.analyzeNotImplemented}
                  </span>
                </div>
              </div>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

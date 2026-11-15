"use client";

import { useState } from "react";
import type { ClauseDto, ExtractionRunDto } from "@/lib/extraction/service";
import { CLAUSE_TYPES } from "@/lib/extraction/types";
import type { Locale, Messages } from "@/lib/i18n";
import { getExtractionErrorMessage } from "@/lib/ui/messages";

export type ExtractionStatus = "idle" | "running" | "succeeded" | "error";

interface ClausesPaneProps {
  messages: Messages["clausesPane"];
  locale: Locale;
  documentId?: string | null;
  status: ExtractionStatus;
  errorCode: string | null;
  runData: ExtractionRunDto | null;
  clauses: ClauseDto[];
  selectedClauseId: string | null;
  onSelectClause: (clause: ClauseDto) => void;
  onExtract: () => void;
  isExtractDisabled: boolean;
}

export function ClausesPane({
  messages,
  locale,
  status,
  errorCode,
  runData,
  clauses,
  selectedClauseId,
  onSelectClause,
  onExtract,
  isExtractDisabled,
}: ClausesPaneProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatSummary = (count: number, rejected: number) => {
    return messages.resultsSummary
      .replace("{count}", String(count))
      .replace("{rejected}", String(rejected));
  };

  // Group clauses by clause_type preserving canonical order
  const groupedClauses = CLAUSE_TYPES.map((type) => {
    return {
      type,
      label: messages.types[type] ?? type,
      items: clauses.filter((c) => c.clause_type === type),
    };
  }).filter((group) => group.items.length > 0);

  return (
    <section
      aria-label={messages.tabTitle}
      className="rounded-lg border border-border-default bg-surface-panel p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <h2 className="text-base font-semibold text-text-primary">{messages.tabTitle}</h2>
        {clauses.length > 0 ? (
          <span className="inline-flex items-center rounded border border-border-default bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-text-secondary">
            {clauses.length}
          </span>
        ) : null}
      </div>

      {/* 1. Running State */}
      {status === "running" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-md border border-border-info bg-surface-info p-5 text-center"
        >
          <div className="flex items-center justify-center gap-3">
            <svg
              className="h-5 w-5 animate-spin text-text-info"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="text-sm font-semibold text-text-info">{messages.runningTitle}</p>
          </div>
          <p className="mt-2 text-xs text-text-secondary">{messages.runningDescription}</p>
        </div>
      ) : null}

      {/* 2. Error State */}
      {status === "error" ? (
        <div
          role="alert"
          className="mt-4 rounded-md border border-border-danger bg-surface-danger p-4"
        >
          <div className="flex items-start gap-2.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="mt-0.5 h-5 w-5 shrink-0 text-text-danger"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
                clipRule="evenodd"
              />
            </svg>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-text-danger">{messages.errorTitle}</h3>
              <p className="mt-1 text-xs text-text-danger">
                {getExtractionErrorMessage(errorCode, locale)}
              </p>
              <button
                type="button"
                onClick={onExtract}
                disabled={isExtractDisabled}
                className="mt-3 inline-flex items-center rounded-md border border-border-danger bg-surface-panel px-3 py-1.5 text-xs font-semibold text-text-danger hover:bg-surface-subtle disabled:opacity-50"
              >
                {messages.retryButton}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 3. Empty State (Not run yet) */}
      {status === "idle" && clauses.length === 0 ? (
        <div className="mt-4 space-y-4 rounded-md border border-dashed border-border-strong bg-surface-subtle p-6 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className="mx-auto h-9 w-9 text-text-secondary"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {messages.emptyStateHeading}
            </h3>
            <p className="mt-1 text-xs text-text-secondary">
              {messages.emptyStateDescription}
            </p>
          </div>

          <div className="rounded border border-border-warning bg-surface-warning p-2.5 text-left text-xs text-text-warning">
            {messages.extractNotice}
          </div>

          <button
            type="button"
            onClick={onExtract}
            disabled={isExtractDisabled}
            className="inline-flex items-center rounded-md bg-accent-primary px-4 py-2 text-xs font-semibold text-text-inverse hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {messages.extractButton}
          </button>
        </div>
      ) : null}

      {/* 4. Results State */}
      {clauses.length > 0 && status !== "running" ? (
        <div className="mt-4 space-y-5">
          {/* Results Header */}
          <div className="rounded-md border border-border-default bg-surface-subtle p-3.5">
            <p className="text-xs font-medium text-text-primary">
              {formatSummary(
                runData?.accepted_count ?? clauses.length,
                runData?.rejected_count ?? 0,
              )}
            </p>
            {runData?.cached ? (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-border-info bg-surface-info px-2 py-0.5 text-xs font-medium text-text-info">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3.5 w-3.5 shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"
                  />
                </svg>
                <span>{messages.cachedNotice}</span>
              </div>
            ) : null}
          </div>

          {/* Grouped Clauses */}
          <div className="space-y-6">
            {groupedClauses.map((group) => (
              <div key={group.type} className="space-y-3">
                <div className="flex items-center justify-between border-b border-border-subtle pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    {group.label}
                  </h3>
                  <span className="text-xs font-semibold text-text-muted">
                    {group.items.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {group.items.map((clause) => {
                    const isSelected = selectedClauseId === clause.id;
                    const isExpanded = expandedIds.has(clause.id);
                    const shouldTruncate = clause.verbatim_text.length > 280;
                    const displayText =
                      shouldTruncate && !isExpanded
                        ? `${clause.verbatim_text.slice(0, 280)}...`
                        : clause.verbatim_text;

                    return (
                      <div
                        key={clause.id}
                        className={`w-full rounded-md border p-3.5 text-left transition-colors ${
                          isSelected
                            ? "border-accent-primary bg-accent-soft shadow-xs"
                            : "border-border-default bg-surface-canvas hover:border-border-strong hover:bg-surface-subtle"
                        }`}
                      >
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => onSelectClause(clause)}
                          className="w-full text-left rounded focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center rounded border border-border-default bg-surface-panel px-2 py-0.5 text-xs font-semibold text-text-primary">
                              {messages.pageLabel} {clause.page_number}
                            </span>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded border border-border-success bg-surface-success px-2 py-0.5 text-[11px] font-semibold text-text-success">
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 16 16"
                                  fill="currentColor"
                                  className="h-3 w-3 shrink-0"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"
                                  />
                                </svg>
                                <span>{messages.verifiedBadge}</span>
                              </span>

                              {clause.extraction_confidence === "low" ? (
                                <span className="inline-flex items-center gap-1 rounded border border-border-warning bg-surface-warning px-2 py-0.5 text-[11px] font-semibold text-text-warning">
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 16 16"
                                    fill="currentColor"
                                    className="h-3 w-3 shrink-0"
                                  >
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                                    <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z" />
                                  </svg>
                                  <span>{messages.lowConfidenceBadge}</span>
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="font-serif-contract whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
                            {displayText}
                          </div>
                        </button>

                        {shouldTruncate ? (
                          <div className="mt-2 text-right">
                            <button
                              type="button"
                              onClick={() => toggleExpand(clause.id)}
                              className="rounded text-xs font-semibold text-accent-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                            >
                              {isExpanded ? messages.showLess : messages.showMore}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

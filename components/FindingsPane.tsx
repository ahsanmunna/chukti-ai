"use client";

import { useState } from "react";
import type { Locale, Messages } from "@/lib/i18n";
import { formatFindingText } from "@/lib/risk/templates";
import type { Finding, RuleId } from "@/lib/risk/types";
import type { FindingEvidenceItem, FindingRow, RiskSeverity } from "@/lib/supabase/types";
import { getAnalysisErrorMessage } from "@/lib/ui/messages";

export type FindingsStatus = "idle" | "running" | "succeeded" | "error";

export interface FactsSummary {
  total_clauses: number;
  verified_clauses: number;
}

interface FindingsPaneProps {
  messages: Messages["findingsPane"];
  locale: Locale;
  documentId?: string | null;
  status: FindingsStatus;
  errorCode: string | null;
  isStale: boolean;
  findings: FindingRow[];
  playbookUsed: "saved" | "defaults";
  hasClauses: boolean;
  selectedFindingId: string | null;
  onSelectFinding: (finding: FindingRow) => void;
  onSelectEvidence?: (finding: FindingRow, evidenceItem: FindingEvidenceItem) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  factsSummary?: FactsSummary | null;
  initialExpandedAll?: boolean;
}

function SeverityIcon({ severity }: { severity: RiskSeverity }) {
  if (severity === "critical" || severity === "high") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function FindingsPane({
  messages,
  locale,
  documentId,
  status,
  errorCode,
  isStale,
  findings,
  playbookUsed,
  hasClauses,
  selectedFindingId,
  onSelectFinding,
  onSelectEvidence,
  onAnalyze,
  isAnalyzing,
  factsSummary,
  initialExpandedAll = false,
}: FindingsPaneProps) {
  const [expandedWhyIds, setExpandedWhyIds] = useState<Set<string>>(
    () => (initialExpandedAll ? new Set(findings.map((f) => f.id)) : new Set()),
  );
  const [expandedAskIds, setExpandedAskIds] = useState<Set<string>>(
    () => (initialExpandedAll ? new Set(findings.map((f) => f.id)) : new Set()),
  );
  const [expandedDetailsIds, setExpandedDetailsIds] = useState<Set<string>>(
    () => (initialExpandedAll ? new Set(findings.map((f) => f.id)) : new Set()),
  );
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Set<string>>(
    () => (initialExpandedAll ? new Set(findings.map((f) => f.id)) : new Set()),
  );

  const toggleWhy = (id: string) => {
    setExpandedWhyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAsk = (id: string) => {
    setExpandedAskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDetails = (id: string) => {
    setExpandedDetailsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEvidence = (id: string) => {
    setExpandedEvidenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Severity count tally
  const countsBySeverity = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  return (
    <section
      aria-label={messages.tabTitle}
      className="rounded-lg border border-border-default bg-surface-panel p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <h2 className="text-base font-semibold text-text-primary">{messages.tabTitle}</h2>
        {findings.length > 0 ? (
          <span className="inline-flex items-center rounded border border-border-default bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-text-secondary">
            {findings.length}
          </span>
        ) : null}
      </div>

      {/* 1. Stale Notice Banner */}
      {isStale && status !== "running" ? (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-warning bg-surface-warning p-3.5 text-xs text-text-warning"
        >
          <div className="flex items-center gap-2">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-4 w-4 shrink-0 text-text-warning"
            >
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
              <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z" />
            </svg>
            <span>{messages.staleNotice}</span>
          </div>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={isAnalyzing || !hasClauses}
            className="rounded border border-border-warning bg-surface-panel px-2.5 py-1 text-xs font-semibold text-text-warning hover:bg-surface-subtle disabled:opacity-50"
          >
            {messages.reRunButton}
          </button>
        </div>
      ) : null}

      {/* 2. Running State */}
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

      {/* 3. Error State */}
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
                {getAnalysisErrorMessage(errorCode, locale)}
              </p>
              <button
                type="button"
                onClick={onAnalyze}
                disabled={isAnalyzing || !hasClauses}
                className="mt-3 inline-flex items-center rounded-md border border-border-danger bg-surface-panel px-3 py-1.5 text-xs font-semibold text-text-danger hover:bg-surface-subtle disabled:opacity-50"
              >
                {messages.retryButton}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 4. Not Analyzed State (Idle) */}
      {status === "idle" && findings.length === 0 ? (
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
              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {messages.notAnalyzedHeading}
            </h3>
            <p className="mt-1 text-xs text-text-secondary">
              {messages.notAnalyzedDescription}
            </p>
          </div>

          <button
            type="button"
            onClick={onAnalyze}
            disabled={!documentId || !hasClauses || isAnalyzing}
            className="inline-flex items-center rounded-md bg-accent-primary px-4 py-2 text-xs font-semibold text-text-inverse hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? messages.analyzingButton : messages.analyzeButton}
          </button>
        </div>
      ) : null}

      {/* 5. Zero Findings State */}
      {status === "succeeded" && findings.length === 0 ? (
        <div className="mt-4 space-y-4 rounded-md border border-border-default bg-surface-subtle p-6 text-center">
          <div className="rounded border border-border-default bg-surface-panel p-3 text-xs font-semibold text-text-primary">
            {playbookUsed === "saved" ? messages.playbookUsedSaved : messages.playbookUsedDefaults}
          </div>
          <div className="rounded-md border border-border-default bg-surface-canvas p-4 text-center">
            <p className="text-sm font-medium text-text-primary">
              {messages.noFindings}
            </p>
            <p className="mt-2 text-xs text-text-muted">
              {messages.prioritizationNotice}
            </p>
          </div>
        </div>
      ) : null}

      {/* 6. Results State */}
      {findings.length > 0 && status !== "running" ? (
        <div className="mt-4 space-y-5">
          {/* Header Summary */}
          <div className="space-y-2.5 rounded-md border border-border-default bg-surface-subtle p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-primary">
                {playbookUsed === "saved" ? messages.playbookUsedSaved : messages.playbookUsedDefaults}
              </span>
              <span className="text-xs font-medium text-text-secondary">
                {messages.summaryTotal.replace("{count}", String(findings.length))}
              </span>
            </div>

            {/* Severity summary counts */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border-subtle">
              {(["critical", "high", "medium", "low"] as const).map((sev) => {
                const count = countsBySeverity[sev];
                if (count === 0) return null;
                return (
                  <span
                    key={sev}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${
                      sev === "critical" || sev === "high"
                        ? "border-border-danger bg-surface-danger text-text-danger"
                        : sev === "medium"
                          ? "border-border-warning bg-surface-warning text-text-warning"
                          : "border-border-info bg-surface-info text-text-info"
                    }`}
                  >
                    <SeverityIcon severity={sev} />
                    <span>
                      {messages.severityLabels[sev]}: {count}
                    </span>
                  </span>
                );
              })}
            </div>

            {factsSummary ? (
              <div className="pt-1 border-t border-border-subtle text-xs text-text-secondary">
                {messages.factsConfirmed
                  .replace("{verified}", String(factsSummary.verified_clauses))
                  .replace("{total}", String(factsSummary.total_clauses))}
              </div>
            ) : null}

            <p className="text-[11px] text-text-muted">
              {messages.prioritizationNotice}
            </p>
          </div>

          {/* Finding Cards */}
          <div className="space-y-3">
            {findings.map((finding) => {
              const isSelected = selectedFindingId === finding.id;
              const isWhyExpanded = expandedWhyIds.has(finding.id);
              const isAskExpanded = expandedAskIds.has(finding.id);
              const isDetailsExpanded = expandedDetailsIds.has(finding.id);

              const findingObj: Finding = {
                rule_id: finding.rule_id as RuleId,
                rule_version: finding.rules_version,
                source: finding.rule_id.startsWith("PAY-2") ||
                  finding.rule_id.startsWith("PAY-3") ||
                  finding.rule_id.startsWith("LAW-1") ||
                  finding.rule_id.startsWith("IND-1") ||
                  finding.rule_id.startsWith("DEF-1")
                  ? "builtin"
                  : "playbook",
                severity: finding.severity,
                priority: finding.priority,
                clause_ids: finding.clause_ids ?? [],
                evidence: (Array.isArray(finding.evidence) ? finding.evidence : []) as FindingEvidenceItem[],
                params: (finding.params as Record<string, unknown>) ?? {},
                lawyer_review: finding.lawyer_review,
                lawyer_review_reasons: (Array.isArray(finding.lawyer_review_reasons)
                  ? finding.lawyer_review_reasons
                  : []) as string[],
              };

              const text = formatFindingText(findingObj, locale);
              const evidenceList = (Array.isArray(finding.evidence)
                ? finding.evidence
                : []) as FindingEvidenceItem[];

              const pageNumbers = Array.from(
                new Set(evidenceList.map((e) => e.page_number)),
              ).sort((a, b) => a - b);

              const factsUsed = Object.entries(findingObj.params).filter(
                ([k, v]) => v !== null && v !== undefined && k !== "reason",
              );

              return (
                <div
                  key={finding.id}
                  className={`w-full rounded-md border p-3.5 text-left transition-colors ${
                    isSelected
                      ? "border-accent-primary bg-accent-soft shadow-xs"
                      : "border-border-default bg-surface-canvas hover:border-border-strong hover:bg-surface-subtle"
                  }`}
                >
                  {/* Selectable Header */}
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectFinding(finding)}
                    className="w-full text-left rounded focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      {/* Severity Label + Icon */}
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${
                          finding.severity === "critical" || finding.severity === "high"
                            ? "border-border-danger bg-surface-danger text-text-danger"
                            : finding.severity === "medium"
                              ? "border-border-warning bg-surface-warning text-text-warning"
                              : "border-border-info bg-surface-info text-text-info"
                        }`}
                      >
                        <SeverityIcon severity={finding.severity} />
                        <span>{messages.severityLabels[finding.severity]}</span>
                      </span>

                      {/* Page references */}
                      {pageNumbers.length > 0 ? (
                        <span className="inline-flex items-center rounded border border-border-default bg-surface-panel px-2 py-0.5 text-xs font-semibold text-text-primary">
                          {messages.pageLabel} {pageNumbers.join(", ")}
                        </span>
                      ) : null}
                    </div>

                    {/* Title & Vs Line */}
                    <h3 className="text-sm font-bold text-text-primary">
                      {text.title}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-text-secondary">
                      {text.vsLine}
                    </p>

                    {/* Financial Consequence (if known) */}
                    {text.financialConsequence ? (
                      <p className="mt-1.5 text-xs font-semibold text-text-warning">
                        {text.financialConsequence}
                      </p>
                    ) : null}
                  </button>

                  {/* Lawyer Review Badge & Reasons */}
                  {finding.lawyer_review ? (
                    <div className="mt-2.5 rounded border border-border-warning bg-surface-warning p-2 text-xs text-text-warning">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="h-3.5 w-3.5 shrink-0"
                        >
                          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                          <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z" />
                        </svg>
                        <span>{messages.lawyerReviewBadge}</span>
                      </div>
                      {findingObj.lawyer_review_reasons.length > 0 ? (
                        <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[11px]">
                          {findingObj.lawyer_review_reasons.map((r) => (
                            <li key={r}>
                              {messages.lawyerReviewReasons[r as keyof typeof messages.lawyerReviewReasons] ?? r}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Expanders: Why this matters / What to ask for */}
                  <div className="mt-3 space-y-2 border-t border-border-subtle pt-2.5">
                    {/* Why this matters */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleWhy(finding.id)}
                        className="flex w-full items-center justify-between text-left text-xs font-semibold text-text-primary hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                      >
                        <span>{messages.whyThisMatters}</span>
                        <span className="text-[10px] text-text-muted">
                          {isWhyExpanded ? "−" : "+"}
                        </span>
                      </button>
                      {isWhyExpanded ? (
                        <div className="mt-1 text-xs leading-relaxed text-text-secondary">
                          <p>{text.reason}</p>
                          {text.uncertainty ? (
                            <p className="mt-1 text-text-warning">{text.uncertainty}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {/* What to ask for */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleAsk(finding.id)}
                        className="flex w-full items-center justify-between text-left text-xs font-semibold text-text-primary hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                      >
                        <span>{messages.whatToAskFor}</span>
                        <span className="text-[10px] text-text-muted">
                          {isAskExpanded ? "−" : "+"}
                        </span>
                      </button>
                      {isAskExpanded ? (
                        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                          {text.recommendation}
                        </p>
                      ) : null}
                    </div>

                    {/* Evidence Quotes */}
                    {evidenceList.length > 0 ? (
                      <div className="pt-1">
                        <span className="block text-xs font-semibold text-text-secondary">
                          {messages.evidenceTitle}
                        </span>
                        <div className="mt-1 space-y-1.5">
                          {(() => {
                            const isEvidenceExpanded = expandedEvidenceIds.has(finding.id);
                            const visibleEvidence =
                              isEvidenceExpanded || evidenceList.length <= 3
                                ? evidenceList
                                : evidenceList.slice(0, 3);

                            return (
                              <>
                                {visibleEvidence.map((ev, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      onSelectFinding(finding);
                                      onSelectEvidence?.(finding, ev);
                                    }}
                                    className="w-full rounded border border-border-subtle bg-surface-panel p-2 text-left font-serif-contract text-xs text-text-primary hover:border-accent-primary hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                                  >
                                    <span className="mb-0.5 block font-sans text-[10px] font-bold text-text-muted">
                                      {messages.pageLabel} {ev.page_number}
                                    </span>
                                    <span>&ldquo;{ev.quote}&rdquo;</span>
                                  </button>
                                ))}
                                {evidenceList.length > 3 ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleEvidence(finding.id)}
                                    className="mt-1 block text-xs font-medium text-accent-primary hover:underline focus:outline-none"
                                  >
                                    {isEvidenceExpanded
                                      ? "− " + messages.moreRelatedPassages.replace("{n}", String(evidenceList.length - 3))
                                      : messages.moreRelatedPassages.replace("{n}", String(evidenceList.length - 3))}
                                  </button>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ) : null}

                    {/* Details Used */}
                    {factsUsed.length > 0 ? (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => toggleDetails(finding.id)}
                          className="flex w-full items-center justify-between text-left text-[11px] font-semibold text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                        >
                          <span>{messages.detailsUsed}</span>
                          <span className="text-[10px]">{isDetailsExpanded ? "−" : "+"}</span>
                        </button>
                        {isDetailsExpanded ? (
                          <div className="mt-1 space-y-0.5 rounded border border-border-subtle bg-surface-subtle p-2 font-mono text-[11px] text-text-secondary">
                            {factsUsed.map(([k, v]) => {
                              const fieldLabel =
                                messages.factLabels?.fields?.[k as keyof typeof messages.factLabels.fields] ?? k;
                              let displayVal = String(v);
                              if (typeof v === "boolean") {
                                displayVal = v ? (messages.yesLabel ?? "Yes") : (messages.noLabel ?? "No");
                              } else if (Array.isArray(v)) {
                                const enumMap =
                                  messages.factLabels?.values?.[k as keyof typeof messages.factLabels.values];
                                displayVal = v
                                  .map((item) => {
                                    if (typeof item === "string" && enumMap && item in enumMap) {
                                      return (enumMap as Record<string, string>)[item];
                                    }
                                    return String(item);
                                  })
                                  .join(", ");
                              } else if (typeof v === "string") {
                                const enumMap =
                                  messages.factLabels?.values?.[k as keyof typeof messages.factLabels.values];
                                if (enumMap && v in enumMap) {
                                  displayVal = (enumMap as Record<string, string>)[v];
                                }
                              }

                              return (
                                <div key={k} className="flex justify-between gap-2">
                                  <span className="font-medium text-text-muted">{fieldLabel}:</span>
                                  <span className="text-right text-text-primary">{displayVal}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

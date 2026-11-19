"use client";

import { useEffect, useState } from "react";
import type { Locale, Messages } from "@/lib/i18n";
import { DEFAULT_PLAYBOOK, type PlaybookPreferences } from "@/lib/playbook/schema";
import { buildClientDraftMessage, getSuggestedWording, getSuggestedWordingNote } from "@/lib/risk/drafts";
import { formatFindingText } from "@/lib/risk/templates";
import type { Finding, RuleId } from "@/lib/risk/types";
import type { FindingEvidenceItem, FindingRow, RiskSeverity } from "@/lib/supabase/types";
import { getAnalysisErrorMessage } from "@/lib/ui/messages";

export type FindingsStatus = "idle" | "running" | "succeeded" | "error";

export interface FactsSummary {
  total_clauses: number;
  verified_clauses: number;
  no_facts_clauses?: number;
  failed_clauses?: number;
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
  playbook?: PlaybookPreferences;
  onGoToPlaybook?: () => void;
}

function CopyButton({
  textToCopy,
  label,
  copiedLabel,
}: {
  textToCopy: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {
      // Fallback
    }

    try {
      if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded border border-border-default bg-surface-panel px-2.5 py-1 text-[13px] font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
      title={label}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
      >
        <path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z" />
      </svg>
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

function SeverityIcon({ severity }: { severity: RiskSeverity }) {
  if (severity === "critical") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-1-11a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V7Zm1 9a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (severity === "high") {
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
  if (severity === "medium") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M10.362 1.015a.75.75 0 0 0-.724 0L3.138 4.382A.75.75 0 0 0 2.75 5.05v4.95c0 5.485 4.095 9.07 7.027 10.852a.75.75 0 0 0 .446 0c2.932-1.782 7.027-5.367 7.027-10.852V5.05a.75.75 0 0 0-.388-.668l-6.5-3.367ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
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

function ChevronIcon({ isExpanded }: { isExpanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ease-out ${
        isExpanded ? "rotate-180" : ""
      }`}
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function getSeverityChipStyles(severity: RiskSeverity): string {
  switch (severity) {
    case "critical":
      return "bg-[#991b1b] text-white border border-[#7f1d1d] shadow-xs";
    case "high":
      return "bg-[#fff7ed] text-[#9a3412] border border-[#fed7aa]";
    case "medium":
      return "bg-[#fffbeb] text-[#78350f] border border-[#fde68a]";
    case "low":
      return "bg-[#f0f4f8] text-[#1e3a5f] border border-[#cbd5e1]";
  }
}

function getFindingCardBorderAccent(severity: RiskSeverity): string {
  switch (severity) {
    case "critical":
      return "border-l-4 border-l-[#991b1b]";
    case "high":
      return "border-l-4 border-l-[#ea580c]";
    case "medium":
      return "border-l-4 border-l-[#d97706]";
    case "low":
      return "border-l-4 border-l-[#64748b]";
  }
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
  playbook = DEFAULT_PLAYBOOK,
  onGoToPlaybook,
}: FindingsPaneProps) {
  const [isClientMessageExpanded, setIsClientMessageExpanded] = useState(false);

  // Open "Why this matters" and "What to ask for" by default for the first finding only; collapse the rest.
  const [expandedWhyIds, setExpandedWhyIds] = useState<Set<string>>(() => {
    if (initialExpandedAll) return new Set(findings.map((f) => f.id));
    return findings.length > 0 ? new Set([findings[0].id]) : new Set();
  });
  const [expandedAskIds, setExpandedAskIds] = useState<Set<string>>(() => {
    if (initialExpandedAll) return new Set(findings.map((f) => f.id));
    return findings.length > 0 ? new Set([findings[0].id]) : new Set();
  });
  const [expandedDetailsIds, setExpandedDetailsIds] = useState<Set<string>>(
    () => (initialExpandedAll ? new Set(findings.map((f) => f.id)) : new Set()),
  );
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Set<string>>(
    () => (initialExpandedAll ? new Set(findings.map((f) => f.id)) : new Set()),
  );
  const [expandedSuggestedIds, setExpandedSuggestedIds] = useState<Set<string>>(
    () => (initialExpandedAll ? new Set(findings.map((f) => f.id)) : new Set()),
  );
  const [expandedLawyerIds, setExpandedLawyerIds] = useState<Set<string>>(
    () => (initialExpandedAll ? new Set(findings.map((f) => f.id)) : new Set()),
  );

  useEffect(() => {
    if (findings.length > 0 && expandedWhyIds.size === 0 && !initialExpandedAll) {
      setExpandedWhyIds(new Set([findings[0].id]));
      setExpandedAskIds(new Set([findings[0].id]));
    }
  }, [findings, initialExpandedAll, expandedWhyIds.size]);

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

  const toggleSuggested = (id: string) => {
    setExpandedSuggestedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLawyer = (id: string) => {
    setExpandedLawyerIds((prev) => {
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

  const totalFindings = findings.length;

  const domainFindings: Finding[] = findings.map((f) => ({
    rule_id: f.rule_id as RuleId,
    rule_version: f.rules_version,
    source: "builtin" as const,
    severity: f.severity,
    priority: f.priority,
    clause_ids: f.clause_ids,
    evidence: (f.evidence ?? []) as FindingEvidenceItem[],
    params: (f.params ?? {}) as Record<string, unknown>,
    lawyer_review: f.lawyer_review,
    lawyer_review_reasons: Array.isArray(f.lawyer_review_reasons)
      ? (f.lawyer_review_reasons as string[])
      : [],
  }));

  return (
    <section
      aria-label={messages.tabTitle}
      className="flex flex-col lg:h-full rounded-lg border border-border-default bg-surface-panel p-4 sm:p-6"
    >
      {/* Title without duplicate total chip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <h2 className="text-base font-semibold text-text-primary">{messages.tabTitle}</h2>
      </div>

      {/* 1. Stale Notice Banner */}
      {isStale && status !== "running" ? (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-warning bg-surface-warning p-3.5 text-[13px] text-text-warning"
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
            className="rounded border border-border-warning bg-surface-panel px-2.5 py-1 text-[13px] font-semibold text-text-warning hover:bg-surface-subtle disabled:opacity-50"
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
          className="mt-4 rounded-md border border-border-info bg-surface-info p-6 text-center my-auto"
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
          <p className="mt-2 text-[13px] text-text-secondary">{messages.runningDescription}</p>
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
              <p className="mt-1 text-[13px] text-text-danger">
                {getAnalysisErrorMessage(errorCode, locale)}
              </p>
              <button
                type="button"
                onClick={onAnalyze}
                disabled={isAnalyzing || !hasClauses}
                className="mt-3 inline-flex items-center rounded-md border border-border-danger bg-surface-panel px-3 py-1.5 text-[13px] font-semibold text-text-danger hover:bg-surface-subtle disabled:opacity-50"
              >
                {messages.retryButton}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 4. Not Analyzed State (Idle) */}
      {status === "idle" && findings.length === 0 ? (
        <div className="mt-4 space-y-4 rounded-md border border-dashed border-border-strong bg-surface-subtle p-8 text-center my-auto">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className="mx-auto h-10 w-10 text-text-secondary"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
            />
          </svg>
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">
              {messages.notAnalyzedHeading}
            </h3>
            <p className="mt-1 text-[13px] text-text-secondary">
              {messages.notAnalyzedDescription}
            </p>
          </div>

          <button
            type="button"
            onClick={onGoToPlaybook}
            className="inline-flex items-center rounded-md bg-accent-primary px-4 py-2 text-[13px] font-semibold text-text-inverse hover:bg-accent-primary-hover shadow-xs focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
          >
            {messages.goToPlaybookButton ?? messages.goToPlaybook}
          </button>
        </div>
      ) : null}

      {/* 5. Zero Findings State */}
      {status === "succeeded" && findings.length === 0 ? (
        <div className="mt-4 space-y-4 rounded-md border border-border-default bg-surface-subtle p-6 text-center my-auto">
          <div className="rounded border border-border-default bg-surface-panel p-3 text-[13px] font-semibold text-text-primary">
            {playbookUsed === "saved" ? messages.playbookUsedSaved : messages.playbookUsedDefaults}
          </div>
          <div className="rounded-md border border-border-default bg-surface-canvas p-4 text-center">
            <p className="text-[15px] font-medium text-text-primary">
              {messages.noFindings}
            </p>
            <p className="mt-2 text-[13px] text-text-muted">
              {messages.prioritizationNotice}
            </p>
          </div>
        </div>
      ) : null}

      {/* 6. Results State */}
      {findings.length > 0 && status !== "running" ? (
        <div className="mt-4 space-y-4 flex-1 lg:overflow-y-auto pr-1">
          {/* Header Summary Strip: proportional horizontal bar + counts */}
          <div className="space-y-3 rounded-md border border-border-default bg-surface-subtle p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-text-primary">
                {playbookUsed === "saved" ? messages.playbookUsedSaved : messages.playbookUsedDefaults}
              </span>
            </div>

            {/* Horizontal proportional bar */}
            {totalFindings > 0 ? (
              <div
                className="h-2.5 w-full flex overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label="Severity distribution"
                aria-valuemin={0}
                aria-valuemax={totalFindings}
                aria-valuenow={totalFindings}
              >
                {countsBySeverity.critical > 0 && (
                  <div
                    style={{ width: `${(countsBySeverity.critical / totalFindings) * 100}%` }}
                    className="bg-[#991b1b] transition-[width] duration-300"
                    title={`${messages.severityLabels.critical}: ${countsBySeverity.critical}`}
                  />
                )}
                {countsBySeverity.high > 0 && (
                  <div
                    style={{ width: `${(countsBySeverity.high / totalFindings) * 100}%` }}
                    className="bg-[#ea580c] transition-[width] duration-300"
                    title={`${messages.severityLabels.high}: ${countsBySeverity.high}`}
                  />
                )}
                {countsBySeverity.medium > 0 && (
                  <div
                    style={{ width: `${(countsBySeverity.medium / totalFindings) * 100}%` }}
                    className="bg-[#d97706] transition-[width] duration-300"
                    title={`${messages.severityLabels.medium}: ${countsBySeverity.medium}`}
                  />
                )}
                {countsBySeverity.low > 0 && (
                  <div
                    style={{ width: `${(countsBySeverity.low / totalFindings) * 100}%` }}
                    className="bg-[#64748b] transition-[width] duration-300"
                    title={`${messages.severityLabels.low}: ${countsBySeverity.low}`}
                  />
                )}
              </div>
            ) : null}

            {/* Severity summary counts */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {(["critical", "high", "medium", "low"] as const).map((sev) => {
                const count = countsBySeverity[sev];
                if (count === 0) return null;
                return (
                  <span
                    key={sev}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${getSeverityChipStyles(
                      sev,
                    )}`}
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
              <div className="pt-2 border-t border-border-subtle text-[13px] space-y-0.5">
                <p className="text-text-secondary">
                  {(messages.factsSummaryLine ?? "")
                    .replace("{extracted}", String(factsSummary.verified_clauses))
                    .replace(
                      "{none}",
                      String(
                        factsSummary.no_facts_clauses ??
                          Math.max(
                            0,
                            factsSummary.total_clauses -
                              factsSummary.verified_clauses -
                              (factsSummary.failed_clauses ?? 0),
                          ),
                      ),
                    )}
                </p>
                {(factsSummary.failed_clauses ?? 0) > 0 ? (
                  <p className="text-text-warning">
                    {(messages.factsWarningLine ?? "").replace(
                      "{failed}",
                      String(factsSummary.failed_clauses),
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

            <p className="text-[13px] text-text-muted">
              {messages.prioritizationNotice}
            </p>
          </div>

          {/* Finding Cards */}
          <div className="space-y-3">
            {findings.map((finding, idx) => {
              const isSelected = selectedFindingId === finding.id;
              const isWhyExpanded = initialExpandedAll || expandedWhyIds.has(finding.id);
              const isAskExpanded = initialExpandedAll || expandedAskIds.has(finding.id);
              const isDetailsExpanded = initialExpandedAll || expandedDetailsIds.has(finding.id);
              const isEvidenceExpanded = initialExpandedAll || expandedEvidenceIds.has(finding.id);
              const isSuggestedExpanded = initialExpandedAll || expandedSuggestedIds.has(finding.id);
              const isLawyerExpanded = initialExpandedAll || expandedLawyerIds.has(finding.id);

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

              const fieldLabels = messages.factLabels?.fields as Record<string, string> | undefined;
              const valueLabels = messages.factLabels?.values as Record<string, Record<string, string>> | undefined;

              const factsUsed: Array<{ key: string; label: string; displayValue: string }> = [];

              for (const [k, v] of Object.entries(findingObj.params)) {
                if (v === null || v === undefined) {
                  continue;
                }
                const fieldLabel = fieldLabels?.[k];
                if (!fieldLabel) {
                  continue;
                }

                if (typeof v === "boolean") {
                  factsUsed.push({
                    key: k,
                    label: fieldLabel,
                    displayValue: v ? (messages.yesLabel ?? "Yes") : (messages.noLabel ?? "No"),
                  });
                } else if (typeof v === "number") {
                  factsUsed.push({
                    key: k,
                    label: fieldLabel,
                    displayValue: String(v),
                  });
                } else if (typeof v === "string") {
                  const mapped = valueLabels?.[k]?.[v];
                  if (mapped) {
                    factsUsed.push({
                      key: k,
                      label: fieldLabel,
                      displayValue: mapped,
                    });
                  }
                } else if (Array.isArray(v)) {
                  const enumMap = valueLabels?.[k];
                  const mappedItems: string[] = [];
                  let allValid = true;
                  for (const item of v) {
                    if (typeof item === "boolean") {
                      mappedItems.push(item ? (messages.yesLabel ?? "Yes") : (messages.noLabel ?? "No"));
                    } else if (typeof item === "number") {
                      mappedItems.push(String(item));
                    } else if (typeof item === "string" && enumMap && item in enumMap) {
                      mappedItems.push(enumMap[item]);
                    } else {
                      allValid = false;
                      break;
                    }
                  }
                  if (allValid && mappedItems.length > 0) {
                    factsUsed.push({
                      key: k,
                      label: fieldLabel,
                      displayValue: mappedItems.join(", "),
                    });
                  }
                }
              }

              // 30ms stagger for cards (max 8)
              const staggerDelay = Math.min(idx, 7) * 30;

              return (
                <div
                  key={finding.id}
                  style={{ animationDelay: `${staggerDelay}ms` }}
                  className={`animate-card-in w-full rounded-md border p-4 text-left transition-colors ${getFindingCardBorderAccent(
                    finding.severity,
                  )} ${
                    isSelected
                      ? "bg-accent-soft/70 shadow-xs ring-1 ring-accent-primary"
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
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      {/* Severity Label + Icon */}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${getSeverityChipStyles(
                          finding.severity,
                        )}`}
                      >
                        <SeverityIcon severity={finding.severity} />
                        <span>{messages.severityLabels[finding.severity]}</span>
                      </span>

                      {/* Page references */}
                      {pageNumbers.length > 0 ? (
                        <span className="inline-flex items-center rounded border border-border-default bg-surface-panel px-2 py-0.5 text-[13px] font-semibold text-text-secondary">
                          {messages.pageLabel} {pageNumbers.join(", ")}
                        </span>
                      ) : null}
                    </div>

                    {/* Stronger Title (17-18px, weight 600) & Vs Line */}
                    <h3 className="text-[17px] font-semibold text-text-primary leading-snug">
                      {text.title}
                    </h3>
                    <p className="mt-1 text-[15px] leading-[1.6] font-medium text-text-secondary">
                      {text.vsLine}
                    </p>

                    {/* Financial Consequence (if known) */}
                    {text.financialConsequence ? (
                      <p className="mt-1.5 text-[15px] leading-[1.6] font-semibold text-text-warning">
                        {text.financialConsequence}
                      </p>
                    ) : null}
                  </button>

                  {/* Compact Lawyer Review Chip that expands to reasons */}
                  {finding.lawyer_review ? (
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() => toggleLawyer(finding.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[13px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="h-3.5 w-3.5 shrink-0 text-amber-700"
                        >
                          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                          <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z" />
                        </svg>
                        <span>{messages.lawyerReviewBadge}</span>
                        <ChevronIcon isExpanded={isLawyerExpanded} />
                      </button>

                      {isLawyerExpanded && findingObj.lawyer_review_reasons.length > 0 ? (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-[13px] text-amber-900">
                          <ul className="list-disc pl-4 space-y-1 text-[13px] leading-[1.6]">
                            {findingObj.lawyer_review_reasons
                              .map(
                                (r) =>
                                  messages.lawyerReviewReasons[
                                    r as keyof typeof messages.lawyerReviewReasons
                                  ],
                              )
                              .filter(Boolean)
                              .map((reasonText, rIdx) => (
                                <li key={rIdx}>{reasonText}</li>
                              ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Labeled Sections with Chevrons and Consistent Spacing */}
                  <div className="mt-3.5 space-y-2.5 border-t border-border-subtle pt-3">
                    {/* 1. Why this matters */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleWhy(finding.id)}
                        className="flex w-full items-center justify-between text-left text-[15px] font-semibold text-text-primary hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                      >
                        <span>{messages.whyThisMatters}</span>
                        <ChevronIcon isExpanded={isWhyExpanded} />
                      </button>
                      {isWhyExpanded ? (
                        <div className="mt-1.5 text-[15px] leading-[1.6] text-text-secondary">
                          <p>{text.reason}</p>
                          {text.uncertainty ? (
                            <p className="mt-1 text-text-warning">{text.uncertainty}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {/* 2. What to ask for */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleAsk(finding.id)}
                        className="flex w-full items-center justify-between text-left text-[15px] font-semibold text-text-primary hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                      >
                        <span>{messages.whatToAskFor}</span>
                        <ChevronIcon isExpanded={isAskExpanded} />
                      </button>
                      {isAskExpanded ? (
                        <div className="mt-1.5 space-y-2">
                          <p className="text-[15px] leading-[1.6] text-text-secondary">
                            {text.recommendation}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {/* 3. Suggested wording */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleSuggested(finding.id)}
                        className="flex w-full items-center justify-between text-left text-[15px] font-semibold text-text-primary hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                      >
                        <span>{messages.suggestedWordingTitle}</span>
                        <ChevronIcon isExpanded={isSuggestedExpanded} />
                      </button>
                      {isSuggestedExpanded ? (
                        <div className="mt-1.5 rounded-md border border-border-default bg-surface-subtle p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[15px] font-semibold text-text-primary">
                              {messages.suggestedWordingTitle}
                            </span>
                            <CopyButton
                              textToCopy={getSuggestedWording(findingObj, playbook)}
                              label={messages.copyButton}
                              copiedLabel={messages.copiedButton}
                            />
                          </div>
                          {getSuggestedWordingNote(findingObj, playbook) ? (
                            <p className="text-[13px] leading-[1.6] text-text-muted">
                              {getSuggestedWordingNote(findingObj, playbook)}
                            </p>
                          ) : null}
                          <div className="font-serif-contract text-[15px] text-text-primary bg-surface-canvas p-3 rounded border border-border-subtle whitespace-pre-wrap select-all leading-[1.6]">
                            {getSuggestedWording(findingObj, playbook)}
                          </div>
                          <p className="text-[13px] leading-[1.6] text-text-muted">
                            {messages.starterDraftDisclaimer}
                            {finding.lawyer_review ? ` ${messages.lawyerReviewNote}` : ""}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {/* 4. Evidence */}
                    {evidenceList.length > 0 ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleEvidence(finding.id)}
                          className="flex w-full items-center justify-between text-left text-[15px] font-semibold text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                        >
                          <span>{messages.evidenceTitle}</span>
                          <ChevronIcon isExpanded={isEvidenceExpanded} />
                        </button>
                        {isEvidenceExpanded ? (
                          <div className="mt-2 space-y-2">
                            {evidenceList.map((ev, evIdx) => (
                              <blockquote
                                key={evIdx}
                                onClick={() => {
                                  onSelectFinding(finding);
                                  onSelectEvidence?.(finding, ev);
                                }}
                                tabIndex={0}
                                role="button"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    onSelectFinding(finding);
                                    onSelectEvidence?.(finding, ev);
                                  }
                                }}
                                className="cursor-pointer border-l-2 border-accent-primary bg-surface-panel hover:bg-accent-soft/60 rounded-r-md p-2.5 transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                              >
                                <div className="mb-1.5 flex items-center justify-between">
                                  <span className="inline-flex items-center rounded-sm border border-border-default bg-surface-subtle px-1.5 py-0.5 text-[13px] font-semibold text-text-secondary">
                                    {messages.pageLabel} {ev.page_number}
                                  </span>
                                </div>
                                <p className="font-serif-contract text-[15px] text-text-primary italic leading-[1.6]">
                                  &ldquo;{ev.quote}&rdquo;
                                </p>
                              </blockquote>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {/* 5. Details used */}
                    {factsUsed.length > 0 ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleDetails(finding.id)}
                          className="flex w-full items-center justify-between text-left text-[15px] font-semibold text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
                        >
                          <span>{messages.detailsUsed}</span>
                          <ChevronIcon isExpanded={isDetailsExpanded} />
                        </button>
                        {isDetailsExpanded ? (
                          <div className="mt-1.5 space-y-1 rounded border border-border-subtle bg-surface-subtle p-2.5 font-mono text-[13px] text-text-secondary">
                            {factsUsed.map(({ key, label, displayValue }) => (
                              <div key={key} className="flex justify-between gap-2">
                                <span className="font-medium text-text-muted">{label}:</span>
                                <span className="text-right text-text-primary">{displayValue}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Draft message to the client */}
          <div className="rounded-md border border-border-default bg-surface-canvas">
            <button
              type="button"
              onClick={() => setIsClientMessageExpanded(!isClientMessageExpanded)}
              className="flex w-full items-center justify-between p-3.5 text-left text-[15px] font-semibold text-text-primary hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-accent-primary focus:outline-none"
            >
              <span>{messages.draftMessageTitle}</span>
              <ChevronIcon isExpanded={isClientMessageExpanded} />
            </button>
            {isClientMessageExpanded ? (
              <div className="border-t border-border-subtle p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] leading-[1.6] text-text-secondary">
                    {messages.draftMessageDescription}
                  </p>
                  <CopyButton
                    textToCopy={buildClientDraftMessage(domainFindings, playbook)}
                    label={messages.copyButton}
                    copiedLabel={messages.copiedButton}
                  />
                </div>
                <textarea
                  readOnly
                  rows={12}
                  value={buildClientDraftMessage(domainFindings, playbook)}
                  className="w-full rounded border border-border-default bg-surface-subtle p-2.5 font-mono text-[13px] leading-[1.6] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary resize-y"
                />
                <p className="text-[13px] leading-[1.6] text-text-muted">
                  {messages.draftMessageDisclaimer}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

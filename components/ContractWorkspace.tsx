"use client";

import { useEffect, useState } from "react";
import type { DocumentMetadataDto, DocumentPageDto } from "@/lib/documents/types";
import { type Locale, getMessages } from "@/lib/i18n";
import {
  type PlaybookPreferences,
  cloneDefaultPlaybook,
  formatPlaybookFieldErrors,
  playbookSchema,
} from "@/lib/playbook/schema";
import { isPlaybookStale as checkPlaybookStale } from "@/lib/playbook/stale";
import {
  DocumentPane,
  type DocumentHighlightRange,
  type DocumentPaneStatus,
  type DocumentUploadError,
  type SelectedClauseRange,
} from "./DocumentPane";
import {
  PlaybookPane,
  type PlaybookErrorKind,
  type PlaybookSaveStatus,
} from "./PlaybookPane";
import { ClausesPane, type ExtractionStatus } from "./ClausesPane";
import { FindingsPane, type FactsSummary, type FindingsStatus } from "./FindingsPane";
import type { FindingEvidenceItem, FindingRow } from "@/lib/supabase/types";
import {
  getAnalysisErrorMessage,
  getExtractionErrorMessage,
} from "@/lib/ui/messages";
import type {
  ClauseDto,
  ExtractionResponseDto,
  ExtractionRunDto,
} from "@/lib/extraction/service";

interface DocumentResponsePayload {
  document: DocumentMetadataDto;
  pages: DocumentPageDto[];
}

interface PlaybookResponsePayload {
  document_id: string;
  saved: boolean;
  playbook: PlaybookPreferences;
  updated_at: string | null;
}

interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ContractWorkspace() {
  const [locale, setLocale] = useState<Locale>("en");
  const [activeMobileTab, setActiveMobileTab] = useState<"document" | "playbook">("document");

  const [docStatus, setDocStatus] = useState<DocumentPaneStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"uploading" | "processing">("uploading");
  const [uploadingFilename, setUploadingFilename] = useState("");
  const [docError, setDocError] = useState<DocumentUploadError | null>(null);
  const [documentData, setDocumentData] = useState<DocumentResponsePayload | null>(null);
  const [isLoadExistingError, setIsLoadExistingError] = useState(false);
  const [initialDocId, setInitialDocId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const id = new URLSearchParams(window.location.search).get("documentId");
      if (id && UUID_PATTERN.test(id)) return id;
    }
    return null;
  });

  const [playbook, setPlaybook] = useState<PlaybookPreferences>(() => cloneDefaultPlaybook());
  const [playbookLoading, setPlaybookLoading] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).has("documentId");
    }
    return false;
  });
  const [playbookLoaded, setPlaybookLoaded] = useState(() => {
    if (typeof window !== "undefined") {
      return !new URLSearchParams(window.location.search).has("documentId");
    }
    return true;
  });
  const [playbookLoadError, setPlaybookLoadError] = useState(false);
  const [playbookSaveStatus, setPlaybookSaveStatus] = useState<PlaybookSaveStatus>("idle");
  const [hasServerSaved, setHasServerSaved] = useState(false);
  const [isPlaybookDirty, setIsPlaybookDirty] = useState(false);
  const [playbookFieldErrors, setPlaybookFieldErrors] = useState<Record<string, string>>({});
  const [playbookErrorKind, setPlaybookErrorKind] = useState<PlaybookErrorKind>(null);

  const [activeRightTab, setActiveRightTab] = useState<"playbook" | "clauses" | "findings">("playbook");
  const [extractStatus, setExtractStatus] = useState<ExtractionStatus>("idle");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [runData, setRunData] = useState<ExtractionRunDto | null>(null);
  const [clauses, setClauses] = useState<ClauseDto[]>([]);
  const [selectedClause, setSelectedClause] = useState<SelectedClauseRange | null>(null);

  const [findingsStatus, setFindingsStatus] = useState<FindingsStatus>("idle");
  const [findingsError, setFindingsError] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState<1 | 2 | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [factsSummary, setFactsSummary] = useState<FactsSummary | null>(null);
  const [playbookUsed, setPlaybookUsed] = useState<"saved" | "defaults">("defaults");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [highlightRanges, setHighlightRanges] = useState<DocumentHighlightRange[] | null>(null);

  const isPlaybookStale = (() => {
    if (playbookLoading || !playbookLoaded) return false;
    if (findings.length === 0) return false;
    const firstSnapshot = findings[0]?.playbook_snapshot as {
      preferences?: PlaybookPreferences;
    } | null;
    if (!firstSnapshot || !firstSnapshot.preferences) return false;
    return checkPlaybookStale(firstSnapshot.preferences, playbook, playbookLoading || !playbookLoaded);
  })();

  const messages = getMessages(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const loadPlaybookForDocument = async (documentId: string) => {
    setPlaybookLoading(true);
    setPlaybookLoaded(false);
    setPlaybookLoadError(false);
    setPlaybookFieldErrors({});
    setPlaybookErrorKind(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/playbook`, {
        method: "GET",
      });
      if (!response.ok) {
        setPlaybookLoadError(true);
        return;
      }
      const data = (await response.json()) as PlaybookResponsePayload;
      setPlaybook(data.playbook);
      setHasServerSaved(data.saved);
      setPlaybookSaveStatus(data.saved ? "saved" : "idle");
      setIsPlaybookDirty(false);
      setPlaybookLoadError(false);
    } catch {
      setPlaybookLoadError(true);
    } finally {
      setPlaybookLoading(false);
      setPlaybookLoaded(true);
    }
  };

  const loadClausesForDocument = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/clauses`, {
        method: "GET",
      });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as
        | ExtractionResponseDto
        | { run: null; clauses: [] };
      if (data.clauses && data.clauses.length > 0) {
        setClauses(data.clauses);
        setRunData(data.run);
        setExtractStatus("succeeded");
      } else {
        setClauses([]);
        setRunData(null);
        setExtractStatus("idle");
      }
    } catch {
      // Non-fatal on initial load
    }
  };

  const handleExtractClauses = async () => {
    const documentId = documentData?.document.id;
    if (!documentId) return;

    setActiveRightTab("clauses");
    setExtractStatus("running");
    setExtractError(null);
    setSelectedClause(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
      });
      const data = (await response.json()) as ExtractionResponseDto & ApiErrorResponse;

      if (!response.ok || !data.run) {
        setExtractStatus("error");
        setExtractError(data.error?.code ?? "unknown");
        return;
      }

      setRunData(data.run);
      setClauses(data.clauses);
      setExtractStatus("succeeded");
    } catch {
      setExtractStatus("error");
      setExtractError("network_error");
    }
  };

  const loadFindingsForDocument = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/findings`);
      if (!response.ok) return;
      const data = (await response.json()) as {
        findings?: FindingRow[];
        facts_summary?: FactsSummary | null;
      };
      if (data.facts_summary) {
        setFactsSummary(data.facts_summary);
      }
      if (data.findings && data.findings.length > 0) {
        setFindings(data.findings);
        setFindingsStatus("succeeded");
        const snap = data.findings[0]?.playbook_snapshot as { is_default?: boolean } | null;
        setPlaybookUsed(snap?.is_default ? "defaults" : "saved");
      } else {
        setFindings([]);
      }
    } catch {
      // Non-fatal on initial load
    }
  };

  const handleAnalyzeRisks = async () => {
    const documentId = documentData?.document.id;
    if (!documentId) return;

    setActiveRightTab("findings");
    setFindingsStatus("running");
    setFindingsError(null);
    setSelectedFindingId(null);
    setHighlightRanges(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/analyze`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        findings?: FindingRow[];
        facts_summary?: FactsSummary | null;
        error?: { code?: string; message?: string };
      };

      if (!response.ok || !data.findings) {
        setFindingsStatus("error");
        setFindingsError(data.error?.code ?? "unknown");
        return;
      }

      if (data.facts_summary) {
        setFactsSummary(data.facts_summary);
      }

      setFindings(data.findings);
      setFindingsStatus("succeeded");
      setPlaybookUsed(hasServerSaved ? "saved" : "defaults");
    } catch {
      setFindingsStatus("error");
      setFindingsError("network_error");
    }
  };

  const handleAnalyzeContract = async () => {
    const documentId = documentData?.document.id;
    if (!documentId) return;

    setAnalysisError(null);

    // Step 1: Read clauses (skip quickly if already extracted/cached)
    if (clauses.length === 0) {
      setAnalysisStep(1);
      setExtractStatus("running");
      setExtractError(null);
      setSelectedClause(null);

      try {
        const response = await fetch(`/api/documents/${documentId}/extract`, {
          method: "POST",
        });
        const data = (await response.json()) as ExtractionResponseDto & ApiErrorResponse;

        if (!response.ok || !data.run) {
          const errCode = data.error?.code ?? "unknown";
          setExtractStatus("error");
          setExtractError(errCode);
          setAnalysisStep(null);
          setAnalysisError(getExtractionErrorMessage(errCode, locale));
          return;
        }

        setRunData(data.run);
        setClauses(data.clauses);
        setExtractStatus("succeeded");
      } catch {
        setExtractStatus("error");
        setExtractError("network_error");
        setAnalysisStep(null);
        setAnalysisError(getExtractionErrorMessage("network_error", locale));
        return;
      }
    }

    // Step 2: Check risks
    setAnalysisStep(2);
    setFindingsStatus("running");
    setFindingsError(null);
    setSelectedFindingId(null);
    setHighlightRanges(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/analyze`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        findings?: FindingRow[];
        facts_summary?: FactsSummary | null;
        error?: { code?: string; message?: string };
      };

      if (!response.ok || !data.findings) {
        const errCode = data.error?.code ?? "unknown";
        setFindingsStatus("error");
        setFindingsError(errCode);
        setAnalysisStep(null);
        setAnalysisError(getAnalysisErrorMessage(errCode, locale));
        return;
      }

      if (data.facts_summary) {
        setFactsSummary(data.facts_summary);
      }

      setFindings(data.findings);
      setFindingsStatus("succeeded");
      setPlaybookUsed(hasServerSaved ? "saved" : "defaults");
      setAnalysisStep(null);
      setActiveRightTab("findings");
    } catch {
      setFindingsStatus("error");
      setFindingsError("network_error");
      setAnalysisStep(null);
      setAnalysisError(getAnalysisErrorMessage("network_error", locale));
    }
  };

  const handleSelectFinding = (finding: FindingRow) => {
    setSelectedFindingId(finding.id);
    setSelectedClause(null);
    const evidenceList = (Array.isArray(finding.evidence)
      ? finding.evidence
      : []) as FindingEvidenceItem[];

    setHighlightRanges(
      evidenceList.map((e) => ({
        id: e.clause_id,
        page_number: e.page_number,
        char_start: e.char_start,
        char_end: e.char_end,
      })),
    );

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setActiveMobileTab("document");
    }
  };

  const handleSelectEvidence = (finding: FindingRow, evidenceItem: FindingEvidenceItem) => {
    setSelectedFindingId(finding.id);
    setSelectedClause(null);
    setHighlightRanges([
      {
        id: evidenceItem.clause_id,
        page_number: evidenceItem.page_number,
        char_start: evidenceItem.char_start,
        char_end: evidenceItem.char_end,
      },
    ]);

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setActiveMobileTab("document");
    }
  };

  const handleSelectClause = (clause: ClauseDto) => {
    setSelectedFindingId(null);
    setHighlightRanges(null);
    setSelectedClause({
      id: clause.id,
      page_number: clause.page_number,
      char_start: clause.char_start,
      char_end: clause.char_end,
    });
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setActiveMobileTab("document");
    }
  };

  const loadInitialDocument = async (docId: string) => {
    setDocStatus("loading_existing");
    setDocError(null);
    setIsLoadExistingError(false);
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const json = (await res.json()) as DocumentResponsePayload & ApiErrorResponse;
      if (!res.ok || !json.document) {
        setDocStatus("error");
        setDocError({
          code: json.error?.code ?? "unknown",
        });
        setIsLoadExistingError(true);
        setPlaybookLoading(false);
        return;
      }
      setDocumentData({ document: json.document, pages: json.pages });
      setDocStatus("loaded");
      setActiveRightTab("findings");
      await Promise.all([
        loadPlaybookForDocument(json.document.id),
        loadClausesForDocument(json.document.id),
        loadFindingsForDocument(json.document.id),
      ]);
    } catch {
      setDocStatus("error");
      setDocError({
        code: "unknown",
      });
      setIsLoadExistingError(true);
      setPlaybookLoading(false);
    }
  };

  useEffect(() => {
    if (initialDocId) {
      void loadInitialDocument(initialDocId);
    }
  }, [initialDocId]);

  const handleFileSelected = (file: File) => {
    const isPdfExt = file.name.trim().toLowerCase().endsWith(".pdf");
    const isPdfMime = file.type === "application/pdf";
    if (!isPdfExt && !isPdfMime) {
      setDocStatus("error");
      setDocError({ code: "not_pdf" });
      setIsLoadExistingError(false);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setDocStatus("error");
      setDocError({ code: "too_large" });
      setIsLoadExistingError(false);
      return;
    }

    setDocStatus("uploading");
    setDocError(null);
    setIsLoadExistingError(false);
    setUploadProgress(0);
    setUploadStage("uploading");
    setUploadingFilename(file.name);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.timeout = 60000;

    xhr.ontimeout = () => {
      setDocStatus("error");
      setDocError({
        code: "timeout",
      });
      setIsLoadExistingError(false);
    };

    xhr.onabort = () => {
      setDocStatus("error");
      setDocError({
        code: "network_error",
      });
      setIsLoadExistingError(false);
    };

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(95, Math.round((event.loaded / event.total) * 95));
        setUploadProgress(pct);
        if (pct >= 95) {
          setUploadStage("processing");
        }
      }
    };

    xhr.upload.onload = () => {
      setUploadProgress(95);
      setUploadStage("processing");
    };

    xhr.onload = () => {
      setUploadProgress(100);
      let parsed: (DocumentResponsePayload & ApiErrorResponse) | null = null;
      try {
        parsed = JSON.parse(xhr.responseText) as DocumentResponsePayload & ApiErrorResponse;
      } catch {
        parsed = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed?.document) {
        setDocumentData({
          document: parsed.document,
          pages: parsed.pages,
        });
        setDocStatus("loaded");
        setIsLoadExistingError(false);
        setActiveRightTab("findings");
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("documentId", parsed.document.id);
        window.history.replaceState(null, "", nextUrl.toString());
        void loadPlaybookForDocument(parsed.document.id);
        void loadClausesForDocument(parsed.document.id);
        void loadFindingsForDocument(parsed.document.id);
        return;
      }

      setDocStatus("error");
      setDocError({
        code: parsed?.error?.code ?? "unknown",
      });
      setIsLoadExistingError(false);
    };

    xhr.onerror = () => {
      setDocStatus("error");
      setDocError({
        code: "network_error",
      });
      setIsLoadExistingError(false);
    };

    xhr.send(formData);
  };

  const handleResetDocument = () => {
    setDocumentData(null);
    setDocStatus("idle");
    setDocError(null);
    setIsLoadExistingError(false);
    setInitialDocId(null);
    setUploadProgress(0);
    setUploadingFilename("");
    setPlaybook(cloneDefaultPlaybook());
    setPlaybookLoading(false);
    setPlaybookLoadError(false);
    setHasServerSaved(false);
    setIsPlaybookDirty(false);
    setPlaybookSaveStatus("idle");
    setPlaybookFieldErrors({});
    setPlaybookErrorKind(null);
    setClauses([]);
    setRunData(null);
    setExtractStatus("idle");
    setExtractError(null);
    setSelectedClause(null);
    setFindings([]);
    setFindingsStatus("idle");
    setFindingsError(null);
    setAnalysisStep(null);
    setAnalysisError(null);
    setSelectedFindingId(null);
    setHighlightRanges(null);
    setActiveRightTab("playbook");

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("documentId");
    window.history.replaceState(null, "", nextUrl.toString());
  };

  const handlePlaybookChange = (next: PlaybookPreferences) => {
    setPlaybook(next);
    setIsPlaybookDirty(true);
    setPlaybookSaveStatus("idle");
    setPlaybookFieldErrors({});
    setPlaybookErrorKind(null);
  };

  const handleSavePlaybook = async () => {
    const documentId = documentData?.document.id;
    if (!documentId) {
      return;
    }

    const clientCheck = playbookSchema.safeParse(playbook);
    if (!clientCheck.success) {
      setPlaybookFieldErrors(formatPlaybookFieldErrors(clientCheck.error));
      setPlaybookSaveStatus("error");
      setPlaybookErrorKind("validation");
      return;
    }

    setPlaybookSaveStatus("saving");
    setPlaybookFieldErrors({});
    setPlaybookErrorKind(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/playbook`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(clientCheck.data),
      });

      const json = (await response.json()) as PlaybookResponsePayload & ApiErrorResponse;
      if (!response.ok) {
        setPlaybookSaveStatus("error");
        setPlaybookFieldErrors(json.error?.fields ?? {});
        const hasFieldErrors = Boolean(
          json.error?.fields && Object.keys(json.error.fields).length > 0,
        );
        setPlaybookErrorKind(hasFieldErrors ? "validation" : "failed");
        return;
      }

      setPlaybook(json.playbook);
      setHasServerSaved(true);
      setIsPlaybookDirty(false);
      setPlaybookSaveStatus("saved");
      setPlaybookErrorKind(null);
    } catch {
      setPlaybookSaveStatus("error");
      setPlaybookFieldErrors({});
      setPlaybookErrorKind("failed");
    }
  };

  const isUploaded = Boolean(documentData);

  return (
    <div className={`min-h-screen ${isUploaded ? "md:h-screen" : ""} flex flex-col bg-surface-canvas text-text-primary`}>
      {/* 4. Notice Banner: Slim single line, softer color, small Notice label */}
      <div
        role="banner"
        className="shrink-0 border-b border-amber-200/50 bg-[#fffdf5] px-4 py-1.5 text-xs text-amber-950/80"
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-2 text-center px-4 sm:px-6">
          <span className="inline-flex shrink-0 items-center rounded bg-amber-100/80 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
            {messages.banner.badge}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-600 font-normal truncate sm:whitespace-normal">
            {messages.banner.text}
          </span>
        </div>
      </div>

      {/* Header: Brand with SVG mark, tagline (never overlaps/clips), language switcher */}
      <header className="shrink-0 border-b border-border-subtle bg-surface-panel">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2.5 px-6 sm:px-8 py-3 sm:py-3.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 shrink-0">
              {/* 3. Brand: Small inline SVG logo mark (document with a check) */}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 shrink-0 text-accent-primary"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="m9 15 2 2 4-4" />
              </svg>
              <h1 className="text-lg font-bold tracking-tight text-text-primary whitespace-nowrap">
                {messages.header.brand}
              </h1>
            </div>
            <span className="hidden sm:inline-block text-border-default select-none">|</span>
            {/* 1. Tagline: Never overlaps or clips at any width */}
            <span className="text-xs sm:text-sm font-medium text-text-secondary leading-tight sm:leading-normal break-words">
              {messages.header.subtitle}
            </span>
          </div>

          <div
            role="group"
            aria-label={messages.header.languageLabel}
            className="inline-flex shrink-0 items-center rounded-md border border-border-default bg-surface-subtle p-0.5"
          >
            <button
              type="button"
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
              className={`rounded px-2.5 py-1 text-xs font-semibold tab-transition ${
                locale === "en"
                  ? "bg-accent-primary text-text-inverse"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {messages.header.langEn}
            </button>
            <button
              type="button"
              aria-pressed={locale === "bn"}
              onClick={() => setLocale("bn")}
              className={`rounded px-2.5 py-1 text-xs font-semibold tab-transition ${
                locale === "bn"
                  ? "bg-accent-primary text-text-inverse"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {messages.header.langBn}
            </button>
          </div>
        </div>
      </header>

      {/* 5. Layout: container max-width 1440px, 24-32px gutters */}
      <main className="flex-1 min-h-0 flex flex-col mx-auto w-full max-w-[1440px] px-6 sm:px-8 py-4 sm:py-6">
        {/* Mobile tabs (<768px) shown only after upload */}
        {isUploaded ? (
          <div
            role="tablist"
            aria-label={messages.tabs.groupLabel}
            className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border-default bg-surface-subtle p-1 md:hidden shrink-0"
          >
            <button
              type="button"
              role="tab"
              id="tab-document"
              aria-selected={activeMobileTab === "document"}
              aria-controls="panel-document"
              onClick={() => setActiveMobileTab("document")}
              className={`rounded-md px-3 py-2 text-xs font-semibold tab-transition ${
                activeMobileTab === "document"
                  ? "bg-surface-panel text-text-primary shadow-xs"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {messages.tabs.document}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-playbook"
              aria-selected={activeMobileTab === "playbook"}
              aria-controls="panel-playbook"
              onClick={() => setActiveMobileTab("playbook")}
              className={`rounded-md px-3 py-2 text-xs font-semibold tab-transition ${
                activeMobileTab === "playbook"
                  ? "bg-surface-panel text-text-primary shadow-xs"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {messages.tabs.findings}
            </button>
          </div>
        ) : null}

        {!isUploaded ? (
          /* Empty state (no document): two columns.
             Left: large upload dropzone.
             Right: "How it works" with 3 steps plus the playbook. No large empty boxes. */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left: Large upload dropzone */}
            <div className="md:col-span-7 flex flex-col">
              <DocumentPane
                messages={messages.documentPane}
                locale={locale}
                status={docStatus}
                uploadProgress={uploadProgress}
                uploadStage={uploadStage}
                uploadingFilename={uploadingFilename}
                error={docError}
                documentData={documentData}
                selectedClause={selectedClause}
                highlightRanges={highlightRanges}
                onFileSelected={handleFileSelected}
                onReset={handleResetDocument}
                isLoadExistingError={isLoadExistingError}
                onRetryLoadExisting={() => {
                  if (initialDocId) void loadInitialDocument(initialDocId);
                }}
              />
            </div>

            {/* Right: "How it works" with 3 steps plus the playbook */}
            <div className="md:col-span-5 flex flex-col space-y-5">
              <div className="rounded-lg border border-border-default bg-surface-panel p-5 sm:p-6 space-y-3.5">
                <h2 className="text-base font-semibold text-text-primary">
                  {messages.howItWorks.title}
                </h2>
                <ol className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-primary text-xs font-bold">
                      1
                    </span>
                    <span className="text-sm text-text-secondary leading-snug pt-0.5">
                      {messages.howItWorks.step1}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-primary text-xs font-bold">
                      2
                    </span>
                    <span className="text-sm text-text-secondary leading-snug pt-0.5">
                      {messages.howItWorks.step2}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-primary text-xs font-bold">
                      3
                    </span>
                    <span className="text-sm text-text-secondary leading-snug pt-0.5">
                      {messages.howItWorks.step3}
                    </span>
                  </li>
                </ol>
              </div>

              {/* Playbook */}
              <PlaybookPane
                messages={messages.playbookPane}
                locale={locale}
                documentId={null}
                playbook={playbook}
                loading={playbookLoading}
                loadError={playbookLoadError}
                onRetryLoad={() => {
                  if (documentData?.document.id) {
                    void loadPlaybookForDocument(documentData.document.id);
                  }
                }}
                saveStatus={playbookSaveStatus}
                hasServerSaved={hasServerSaved}
                isDirty={isPlaybookDirty}
                fieldErrors={playbookFieldErrors}
                playbookErrorKind={playbookErrorKind}
                onChange={handlePlaybookChange}
                onSave={() => void handleSavePlaybook()}
                onExtractClauses={handleExtractClauses}
                isExtracting={extractStatus === "running"}
                hasClauses={clauses.length > 0}
                onAnalyzeRisks={handleAnalyzeRisks}
                isAnalyzingRisks={findingsStatus === "running"}
                onAnalyzeContract={handleAnalyzeContract}
                isAnalyzingContract={analysisStep !== null}
                analysisStep={analysisStep}
                analysisError={analysisError}
                onRetryAnalysis={handleAnalyzeContract}
              />
            </div>
          </div>
        ) : (
          /* After upload: a full-height workspace, PDF pane and Findings pane side by side,
             each scrolling inside itself, tab bar always visible. */
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            {/* Left: PDF pane */}
            <div
              id="panel-document"
              role="tabpanel"
              aria-labelledby="tab-document"
              className={`md:col-span-7 h-full min-h-0 flex flex-col ${
                activeMobileTab === "document" ? "flex" : "hidden md:flex"
              }`}
            >
              <DocumentPane
                messages={messages.documentPane}
                locale={locale}
                status={docStatus}
                uploadProgress={uploadProgress}
                uploadStage={uploadStage}
                uploadingFilename={uploadingFilename}
                error={docError}
                documentData={documentData}
                selectedClause={selectedClause}
                highlightRanges={highlightRanges}
                onFileSelected={handleFileSelected}
                onReset={handleResetDocument}
                isLoadExistingError={isLoadExistingError}
                onRetryLoadExisting={() => {
                  if (initialDocId) void loadInitialDocument(initialDocId);
                }}
              />
            </div>

            {/* Right: Tab bar (always visible) + Active Tab Panel */}
            <div
              id="panel-playbook"
              role="tabpanel"
              aria-labelledby="tab-playbook"
              className={`md:col-span-5 h-full min-h-0 flex flex-col ${
                activeMobileTab === "playbook" ? "flex" : "hidden md:flex"
              }`}
            >
              {/* Tab bar: Always visible */}
              <div
                role="tablist"
                aria-label={messages.tabs.rightPaneLabel}
                className="shrink-0 mb-3 grid grid-cols-3 gap-1 rounded-lg border border-border-default bg-surface-subtle p-1"
              >
                <button
                  type="button"
                  role="tab"
                  id="tab-inner-playbook"
                  aria-selected={activeRightTab === "playbook"}
                  aria-controls="panel-inner-playbook"
                  onClick={() => setActiveRightTab("playbook")}
                  className={`tab-transition rounded-md px-2 py-1.5 text-xs font-semibold ${
                    activeRightTab === "playbook"
                      ? "bg-surface-panel text-text-primary shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {messages.tabs.playbook}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-inner-clauses"
                  aria-selected={activeRightTab === "clauses"}
                  aria-controls="panel-inner-clauses"
                  onClick={() => setActiveRightTab("clauses")}
                  className={`tab-transition flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold ${
                    activeRightTab === "clauses"
                      ? "bg-surface-panel text-text-primary shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span>{messages.tabs.clauses}</span>
                  {clauses.length > 0 ? (
                    <span className="rounded-full bg-accent-primary px-1.5 py-0.2 text-[10px] text-text-inverse">
                      {clauses.length}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-inner-findings"
                  aria-selected={activeRightTab === "findings"}
                  aria-controls="panel-inner-findings"
                  onClick={() => setActiveRightTab("findings")}
                  className={`tab-transition flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold ${
                    activeRightTab === "findings"
                      ? "bg-surface-panel text-text-primary shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span>{messages.tabs.findings}</span>
                  {findings.length > 0 ? (
                    <span className="rounded-full bg-accent-primary px-1.5 py-0.2 text-[10px] text-text-inverse">
                      {findings.length}
                    </span>
                  ) : null}
                </button>
              </div>

              {/* Active Tab Panel scrolling inside itself */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {activeRightTab === "playbook" ? (
                  <div
                    id="panel-inner-playbook"
                    role="tabpanel"
                    aria-labelledby="tab-inner-playbook"
                    className="h-full min-h-0"
                  >
                    <PlaybookPane
                      messages={messages.playbookPane}
                      locale={locale}
                      documentId={documentData?.document.id ?? null}
                      playbook={playbook}
                      loading={playbookLoading}
                      loadError={playbookLoadError}
                      onRetryLoad={() => {
                        if (documentData?.document.id) {
                          void loadPlaybookForDocument(documentData.document.id);
                        }
                      }}
                      saveStatus={playbookSaveStatus}
                      hasServerSaved={hasServerSaved}
                      isDirty={isPlaybookDirty}
                      fieldErrors={playbookFieldErrors}
                      playbookErrorKind={playbookErrorKind}
                      onChange={handlePlaybookChange}
                      onSave={() => void handleSavePlaybook()}
                      onExtractClauses={handleExtractClauses}
                      isExtracting={extractStatus === "running"}
                      hasClauses={clauses.length > 0}
                      onAnalyzeRisks={handleAnalyzeRisks}
                      isAnalyzingRisks={findingsStatus === "running"}
                      onAnalyzeContract={handleAnalyzeContract}
                      isAnalyzingContract={analysisStep !== null}
                      analysisStep={analysisStep}
                      analysisError={analysisError}
                      onRetryAnalysis={handleAnalyzeContract}
                    />
                  </div>
                ) : activeRightTab === "clauses" ? (
                  <div
                    id="panel-inner-clauses"
                    role="tabpanel"
                    aria-labelledby="tab-inner-clauses"
                    className="h-full min-h-0"
                  >
                    <ClausesPane
                      messages={messages.clausesPane}
                      locale={locale}
                      documentId={documentData?.document.id ?? null}
                      status={extractStatus}
                      errorCode={extractError}
                      runData={runData}
                      clauses={clauses}
                      selectedClauseId={selectedClause?.id ?? null}
                      onSelectClause={handleSelectClause}
                      onExtract={handleExtractClauses}
                      isExtractDisabled={
                        !documentData?.document.id ||
                        Boolean(playbookLoadError) ||
                        extractStatus === "running" ||
                        analysisStep !== null
                      }
                    />
                  </div>
                ) : (
                  <div
                    id="panel-inner-findings"
                    role="tabpanel"
                    aria-labelledby="tab-inner-findings"
                    className="h-full min-h-0"
                  >
                    <FindingsPane
                      messages={messages.findingsPane}
                      locale={locale}
                      documentId={documentData?.document.id ?? null}
                      status={findingsStatus}
                      errorCode={findingsError}
                      isStale={isPlaybookStale}
                      findings={findings}
                      playbookUsed={playbookUsed}
                      hasClauses={clauses.length > 0}
                      selectedFindingId={selectedFindingId}
                      onSelectFinding={handleSelectFinding}
                      onSelectEvidence={handleSelectEvidence}
                      onAnalyze={handleAnalyzeContract}
                      isAnalyzing={findingsStatus === "running" || analysisStep !== null}
                      factsSummary={factsSummary}
                      playbook={playbook}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

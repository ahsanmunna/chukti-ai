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
import {
  DocumentPane,
  type DocumentPaneStatus,
  type DocumentUploadError,
} from "./DocumentPane";
import { PlaybookPane, type PlaybookSaveStatus } from "./PlaybookPane";

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

  const [playbook, setPlaybook] = useState<PlaybookPreferences>(() => cloneDefaultPlaybook());
  const [playbookLoading, setPlaybookLoading] = useState(false);
  const [playbookLoadError, setPlaybookLoadError] = useState(false);
  const [playbookSaveStatus, setPlaybookSaveStatus] = useState<PlaybookSaveStatus>("idle");
  const [hasServerSaved, setHasServerSaved] = useState(false);
  const [isPlaybookDirty, setIsPlaybookDirty] = useState(false);
  const [playbookFieldErrors, setPlaybookFieldErrors] = useState<Record<string, string>>({});
  const [playbookErrorMessage, setPlaybookErrorMessage] = useState<string | null>(null);

  const messages = getMessages(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const loadPlaybookForDocument = async (documentId: string) => {
    setPlaybookLoading(true);
    setPlaybookLoadError(false);
    setPlaybookFieldErrors({});
    setPlaybookErrorMessage(null);
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
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialDocId = params.get("documentId");
    if (!initialDocId || !UUID_PATTERN.test(initialDocId)) {
      return;
    }

    let cancelled = false;

    const loadInitialDocument = async () => {
      setDocStatus("loading_existing");
      setDocError(null);
      try {
        const res = await fetch(`/api/documents/${initialDocId}`);
        const json = (await res.json()) as DocumentResponsePayload & ApiErrorResponse;
        if (cancelled) {
          return;
        }
        if (!res.ok || !json.document) {
          setDocStatus("error");
          setDocError({
            code: json.error?.code ?? "unknown",
          });
          return;
        }
        setDocumentData({ document: json.document, pages: json.pages });
        setDocStatus("loaded");
        await loadPlaybookForDocument(json.document.id);
      } catch {
        if (!cancelled) {
          setDocStatus("error");
          setDocError({
            code: "unknown",
          });
        }
      }
    };

    void loadInitialDocument();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileSelected = (file: File) => {
    // Client pre-check before sending: reject oversized or non-PDF files without sending.
    const isPdfExt = file.name.trim().toLowerCase().endsWith(".pdf");
    const isPdfMime = file.type === "application/pdf";
    if (!isPdfExt && !isPdfMime) {
      setDocStatus("error");
      setDocError({ code: "not_pdf" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setDocStatus("error");
      setDocError({ code: "too_large" });
      return;
    }

    setDocStatus("uploading");
    setDocError(null);
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
    };

    xhr.onabort = () => {
      setDocStatus("error");
      setDocError({
        code: "network_error",
      });
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
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("documentId", parsed.document.id);
        window.history.replaceState(null, "", nextUrl.toString());
        void loadPlaybookForDocument(parsed.document.id);
        return;
      }

      setDocStatus("error");
      setDocError({
        code: parsed?.error?.code ?? "unknown",
      });
    };

    xhr.onerror = () => {
      setDocStatus("error");
      setDocError({
        code: "network_error",
      });
    };

    xhr.send(formData);
  };

  const handleResetDocument = () => {
    setDocumentData(null);
    setDocStatus("idle");
    setDocError(null);
    setUploadProgress(0);
    setUploadingFilename("");
    setPlaybook(cloneDefaultPlaybook());
    setPlaybookLoadError(false);
    setHasServerSaved(false);
    setIsPlaybookDirty(false);
    setPlaybookSaveStatus("idle");
    setPlaybookFieldErrors({});
    setPlaybookErrorMessage(null);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("documentId");
    window.history.replaceState(null, "", nextUrl.toString());
  };

  const handlePlaybookChange = (next: PlaybookPreferences) => {
    setPlaybook(next);
    setIsPlaybookDirty(true);
    setPlaybookSaveStatus("idle");
    setPlaybookFieldErrors({});
    setPlaybookErrorMessage(null);
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
      setPlaybookErrorMessage(messages.playbookPane.saveErrorSummary);
      return;
    }

    setPlaybookSaveStatus("saving");
    setPlaybookFieldErrors({});
    setPlaybookErrorMessage(null);

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
        setPlaybookErrorMessage(json.error?.message ?? messages.playbookPane.saveErrorSummary);
        return;
      }

      setPlaybook(json.playbook);
      setHasServerSaved(true);
      setIsPlaybookDirty(false);
      setPlaybookSaveStatus("saved");
    } catch {
      setPlaybookSaveStatus("error");
      setPlaybookErrorMessage(messages.playbookPane.saveErrorSummary);
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas text-text-primary">
      <div
        role="banner"
        className="border-b border-border-warning bg-surface-warning px-4 py-2.5 text-sm text-text-warning"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 text-center">
          <span className="inline-flex items-center rounded border border-border-warning bg-surface-panel px-2 py-0.5 text-xs font-semibold text-text-warning">
            {messages.banner.badge}
          </span>
          <span className="font-medium">{messages.banner.text}</span>
        </div>
      </div>

      <header className="border-b border-border-subtle bg-surface-panel">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-text-primary">
              {messages.header.brand}
            </h1>
            <span className="text-xs font-medium text-text-secondary">
              {messages.header.subtitle}
            </span>
          </div>

          <div
            role="group"
            aria-label={messages.header.languageLabel}
            className="inline-flex items-center rounded-md border border-border-default bg-surface-subtle p-0.5"
          >
            <button
              type="button"
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
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
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
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

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Mobile tabs (<768px) */}
        <div
          role="tablist"
          aria-label={messages.tabs.groupLabel}
          className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border-default bg-surface-subtle p-1 md:hidden"
        >
          <button
            type="button"
            role="tab"
            id="tab-document"
            aria-selected={activeMobileTab === "document"}
            aria-controls="panel-document"
            onClick={() => setActiveMobileTab("document")}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
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
            className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
              activeMobileTab === "playbook"
                ? "bg-surface-panel text-text-primary shadow-xs"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {messages.tabs.playbook}
          </button>
        </div>

        {/* Two-pane shell (>=768px) */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-start">
          <div
            id="panel-document"
            role="tabpanel"
            aria-labelledby="tab-document"
            className={`md:col-span-7 md:block ${
              activeMobileTab === "document" ? "block" : "hidden"
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
              onFileSelected={handleFileSelected}
              onReset={handleResetDocument}
            />
          </div>

          <div
            id="panel-playbook"
            role="tabpanel"
            aria-labelledby="tab-playbook"
            className={`md:col-span-5 md:block ${
              activeMobileTab === "playbook" ? "block" : "hidden"
            }`}
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
              serverErrorMessage={playbookErrorMessage}
              onChange={handlePlaybookChange}
              onSave={() => void handleSavePlaybook()}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

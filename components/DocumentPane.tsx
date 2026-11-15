"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentMetadataDto, DocumentPageDto } from "@/lib/documents/types";
import type { Locale, Messages } from "@/lib/i18n";
import { getUploadErrorMessage } from "@/lib/ui/messages";

export type DocumentPaneStatus =
  | "idle"
  | "loading_existing"
  | "uploading"
  | "error"
  | "loaded";

export interface DocumentUploadError {
  code: string;
  message?: string;
}

export interface SelectedClauseRange {
  id: string;
  page_number: number;
  char_start: number;
  char_end: number;
}

interface DocumentPaneProps {
  messages: Messages["documentPane"];
  locale: Locale;
  status: DocumentPaneStatus;
  uploadProgress: number;
  uploadStage: "uploading" | "processing";
  uploadingFilename: string;
  error: DocumentUploadError | null;
  documentData: {
    document: DocumentMetadataDto;
    pages: DocumentPageDto[];
  } | null;
  selectedClause?: SelectedClauseRange | null;
  onFileSelected: (file: File) => void;
  onReset: () => void;
}

export function DocumentPane({
  messages,
  locale,
  status,
  uploadProgress,
  uploadStage,
  uploadingFilename,
  error,
  documentData,
  selectedClause,
  onFileSelected,
  onReset,
}: DocumentPaneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [userPage, setUserPage] = useState<number | null>(null);
  const [prevClauseId, setPrevClauseId] = useState<string | null>(null);

  if (selectedClause && selectedClause.id !== prevClauseId) {
    setPrevClauseId(selectedClause.id);
    setUserPage(selectedClause.page_number);
  }

  const activePage = userPage ?? 1;

  useEffect(() => {
    if (selectedClause) {
      const frameId = requestAnimationFrame(() => {
        const markEl = document.getElementById("highlighted-clause");
        if (markEl) {
          markEl.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          const pageEl = document.getElementById(`contract-page-${selectedClause.page_number}`);
          if (pageEl) {
            pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [selectedClause]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const file = files[0];
    setUserPage(1);
    onFileSelected(file);
  };

  const jumpToPage = (pageNumber: number) => {
    setUserPage(pageNumber);
    const el = document.getElementById(`contract-page-${pageNumber}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  if (status === "loaded" && documentData) {
    const { document: docMeta, pages } = documentData;
    const totalPages = pages.length;
    const currentPage = Math.min(Math.max(1, activePage), Math.max(1, totalPages));

    return (
      <section
        aria-label={messages.extractedTextLabel}
        className="flex flex-col rounded-lg border border-border-default bg-surface-panel"
      >
        <div className="border-b border-border-subtle p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center rounded border border-border-info bg-surface-info px-2 py-0.5 text-xs font-semibold text-text-info">
                {messages.extractedTextLabel}
              </span>
              <h2 className="mt-2 truncate text-base font-semibold text-text-primary">
                {docMeta.original_filename}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                <span>
                  {messages.pagesLabel}: {docMeta.page_count}
                </span>
                {docMeta.sha256 ? (
                  <span title={docMeta.sha256}>
                    {messages.shaLabel}: {docMeta.sha256.slice(0, 12)}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setUserPage(1);
                onReset();
              }}
              className="shrink-0 rounded-md border border-border-default bg-surface-panel px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-subtle"
            >
              {messages.uploadAnother}
            </button>
          </div>

          {totalPages > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-3 py-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="page-jump-select"
                  className="text-xs font-medium text-text-secondary"
                >
                  {messages.pageJumpLabel}
                </label>
                <select
                  id="page-jump-select"
                  value={currentPage}
                  onChange={(event) => jumpToPage(Number(event.target.value))}
                  className="rounded border border-border-default bg-surface-panel px-2 py-1 text-xs font-medium text-text-primary"
                >
                  {pages.map((page) => (
                    <option key={page.page_number} value={page.page_number}>
                      {messages.pageHeader} {page.page_number}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => jumpToPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="rounded border border-border-default bg-surface-panel px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-surface-canvas disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {messages.previousPage}
                </button>
                <button
                  type="button"
                  onClick={() => jumpToPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded border border-border-default bg-surface-panel px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-surface-canvas disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {messages.nextPage}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4 sm:p-5">
          {pages.map((page) => (
            <article
              key={page.page_number}
              id={`contract-page-${page.page_number}`}
              className="rounded-md border border-border-subtle bg-surface-canvas p-4"
            >
              <header className="mb-3 flex items-center justify-between border-b border-border-subtle pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {messages.pageHeader} {page.page_number}
                </h3>
              </header>
              <div className="font-serif-contract whitespace-pre-wrap break-words text-[15px] leading-7 text-text-primary">
                {page.text.length === 0 ? (
                  messages.emptyPageText
                ) : selectedClause && selectedClause.page_number === page.page_number ? (
                  (() => {
                    const text = page.text;
                    const start = Math.max(0, Math.min(selectedClause.char_start, text.length));
                    const end = Math.max(start, Math.min(selectedClause.char_end, text.length));
                    const before = text.slice(0, start);
                    const match = text.slice(start, end);
                    const after = text.slice(end);

                    return (
                      <>
                        {before}
                        <mark
                          id="highlighted-clause"
                          className="rounded-xs border-b-2 border-accent-primary bg-accent-soft text-text-primary underline decoration-accent-primary decoration-2 underline-offset-4"
                        >
                          {match}
                        </mark>
                        {after}
                      </>
                    );
                  })()
                ) : (
                  page.text
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={messages.title}
      className="rounded-lg border border-border-default bg-surface-panel p-4 sm:p-6"
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">{messages.title}</h2>
      </div>

      {status === "loading_existing" ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-border-default bg-surface-subtle p-6 text-center"
        >
          <p className="text-sm font-medium text-text-primary">
            {messages.loadingExistingTitle}
          </p>
        </div>
      ) : null}

      {status === "uploading" ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-border-info bg-surface-info p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text-info">{messages.uploadingTitle}</p>
            <span className="text-xs font-semibold text-text-info">
              {uploadProgress}%
            </span>
          </div>
          {uploadingFilename ? (
            <p className="mt-1 truncate text-xs text-text-secondary">{uploadingFilename}</p>
          ) : null}
          <div
            role="progressbar"
            aria-label={messages.uploadingProgressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full border border-border-default bg-surface-panel"
          >
            <div
              className="h-full bg-accent-primary transition-[width] duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          {uploadStage === "processing" ? (
            <p className="mt-2 text-xs text-text-secondary">{messages.processingServer}</p>
          ) : null}
        </div>
      ) : null}

      {status === "error" && error ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-border-danger bg-surface-danger p-4"
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded border border-border-danger bg-surface-panel px-2 py-0.5 text-xs font-semibold text-text-danger">
                  {messages.errorBadge}
                </span>
              </div>
              <p className="mt-2 text-sm text-text-danger">
                {getUploadErrorMessage(error.code, locale)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {status === "idle" || status === "error" ? (
        <div
          role="region"
          aria-label={messages.dropzoneAriaLabel}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-10 ${
            isDragging
              ? "border-accent-primary bg-accent-soft"
              : "border-border-strong bg-surface-subtle"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className="h-10 w-10 text-text-secondary"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>

          <h3 className="mt-3 text-base font-semibold text-text-primary">
            {messages.emptyHeading}
          </h3>
          <p className="mt-1.5 max-w-md text-sm text-text-secondary">
            {messages.emptyDescription}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-5 inline-flex items-center rounded-md bg-accent-primary px-4 py-2.5 text-sm font-semibold text-text-inverse hover:bg-accent-primary-hover"
          >
            {status === "error" ? messages.tryAgain : messages.chooseFileButton}
          </button>

          <p className="mt-4 max-w-md text-xs text-text-muted">{messages.rulesNote}</p>
          <p className="mt-2 max-w-md text-xs text-text-secondary">{messages.demoNotice}</p>
        </div>
      ) : null}
    </section>
  );
}

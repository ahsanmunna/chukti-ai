import crypto from "node:crypto";
import { getEnvStatus } from "@/lib/env";
import {
  CONTRACTS_STORAGE_BUCKET,
  PdfProcessingError,
  extractPdfPages,
  sanitizeOriginalFilename,
} from "@/lib/pdf";
import {
  type PlaybookPreferences,
  cloneDefaultPlaybook,
  formatPlaybookFieldErrors,
  playbookSchema,
} from "@/lib/playbook/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  DocumentMetadataDto,
  DocumentPageDto,
  DocumentWithPagesDto,
  PlaybookResponseDto,
} from "./types";

export type {
  DocumentMetadataDto,
  DocumentPageDto,
  DocumentWithPagesDto,
  PlaybookResponseDto,
};

export class DocumentServiceError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly fields?: Record<string, string>;

  constructor(
    code: string,
    message: string,
    httpStatus: number,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "DocumentServiceError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.fields = fields;
  }
}

function getAdminClientOrThrow() {
  const env = getEnvStatus();
  if (
    !env.supabaseUrlConfigured ||
    !env.supabaseAnonKeyConfigured ||
    !env.supabaseServiceRoleConfigured
  ) {
    throw new DocumentServiceError(
      "service_unavailable",
      "Supabase environment variables are not configured.",
      503,
    );
  }
  return createSupabaseAdminClient();
}

export async function ingestUploadedPdf(params: {
  bytes: Uint8Array;
  mimeType: string | null | undefined;
  rawFilename: string | null | undefined;
}): Promise<DocumentWithPagesDto> {
  const originalFilename = sanitizeOriginalFilename(params.rawFilename);

  let extracted;
  try {
    extracted = await extractPdfPages({
      bytes: params.bytes,
      mimeType: params.mimeType,
      filename: originalFilename,
    });
  } catch (error) {
    if (error instanceof PdfProcessingError) {
      console.warn(
        `[documents] ingest rejected code=${error.code} bytes=${params.bytes.byteLength}`,
      );
      throw new DocumentServiceError(error.code, error.message, error.httpStatus);
    }
    throw error;
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${documentId}/${crypto.randomUUID()}.pdf`;
  const sha256 = crypto.createHash("sha256").update(params.bytes).digest("hex");

  const supabase = getAdminClientOrThrow();

  const contentType = "application/pdf";

  const { error: uploadError } = await supabase.storage
    .from(CONTRACTS_STORAGE_BUCKET)
    .upload(storagePath, params.bytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    const statusCode =
      "statusCode" in uploadError && uploadError.statusCode !== undefined
        ? uploadError.statusCode
        : undefined;
    console.error(`[documents] storage_upload_failed id=${documentId}`, {
      name: uploadError.name,
      message: uploadError.message,
      ...(statusCode !== undefined ? { statusCode } : {}),
      bytes: params.bytes.byteLength,
      contentType,
    });
    throw new DocumentServiceError(
      "storage_error",
      "Failed to store the uploaded contract file.",
      500,
    );
  }

  let docInserted = false;
  try {
    const { data: docRow, error: docError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        title: originalFilename,
        file_name: originalFilename,
        original_filename: originalFilename,
        sha256,
        storage_path: storagePath,
        mime_type: "application/pdf",
        file_size_bytes: params.bytes.byteLength,
        page_count: extracted.pageCount,
        status: "extracted",
      })
      .select("id, original_filename, sha256, page_count, status, storage_path, created_at")
      .single();

    if (docError || !docRow) {
      console.error(`[documents] db_insert_failed id=${documentId}`);
      throw new DocumentServiceError(
        "database_error",
        "Failed to save document metadata.",
        500,
      );
    }
    docInserted = true;

    const pageRows = extracted.pages.map((page) => ({
      document_id: documentId,
      page_number: page.page_number,
      text: page.text,
      char_count: page.char_count,
    }));

    const { error: pagesError } = await supabase
      .from("document_pages")
      .insert(pageRows);

    if (pagesError) {
      console.error(`[documents] pages_insert_failed id=${documentId}`);
      throw new DocumentServiceError(
        "database_error",
        "Failed to save extracted contract pages.",
        500,
      );
    }

    console.info(
      `[documents] ingested id=${documentId} size=${params.bytes.byteLength} pages=${extracted.pageCount}`,
    );

    return {
      document: {
        id: docRow.id,
        original_filename: docRow.original_filename ?? originalFilename,
        sha256: docRow.sha256 ?? sha256,
        page_count: docRow.page_count ?? extracted.pageCount,
        status: docRow.status,
        storage_path: docRow.storage_path ?? storagePath,
        created_at: docRow.created_at,
      },
      pages: extracted.pages.map((page) => ({
        page_number: page.page_number,
        text: page.text,
      })),
    };
  } catch (error) {
    // Best-effort rollback so failed ingests leave no orphaned storage objects or rows.
    if (docInserted) {
      await supabase.from("documents").delete().eq("id", documentId);
    }
    await supabase.storage.from(CONTRACTS_STORAGE_BUCKET).remove([storagePath]);
    throw error;
  }
}

export async function getDocumentWithPages(
  documentId: string,
): Promise<DocumentWithPagesDto> {
  const supabase = getAdminClientOrThrow();

  const { data: docRow, error: docError } = await supabase
    .from("documents")
    .select(
      "id, original_filename, file_name, sha256, page_count, status, storage_path, created_at",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (docError) {
    console.error(`[documents] fetch_failed id=${documentId}`);
    throw new DocumentServiceError("database_error", "Failed to fetch document.", 500);
  }

  if (!docRow) {
    throw new DocumentServiceError("not_found", "Document not found.", 404);
  }

  const { data: pageRows, error: pagesError } = await supabase
    .from("document_pages")
    .select("page_number, text")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });

  if (pagesError) {
    console.error(`[documents] pages_fetch_failed id=${documentId}`);
    throw new DocumentServiceError(
      "database_error",
      "Failed to fetch document pages.",
      500,
    );
  }

  const pages = (pageRows ?? []).map((row) => ({
    page_number: row.page_number as number,
    text: row.text as string,
  }));

  return {
    document: {
      id: docRow.id,
      original_filename: docRow.original_filename ?? docRow.file_name,
      sha256: docRow.sha256 ?? "",
      page_count: docRow.page_count ?? pages.length,
      status: docRow.status,
      storage_path: docRow.storage_path ?? "",
      created_at: docRow.created_at,
    },
    pages,
  };
}

async function assertDocumentExists(documentId: string) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    console.error(`[playbook] doc_lookup_failed id=${documentId}`);
    throw new DocumentServiceError("database_error", "Failed to verify document.", 500);
  }
  if (!data) {
    throw new DocumentServiceError("not_found", "Document not found.", 404);
  }
}

export async function getDocumentPlaybook(
  documentId: string,
): Promise<PlaybookResponseDto> {
  await assertDocumentExists(documentId);

  const supabase = getAdminClientOrThrow();
  const { data: row, error } = await supabase
    .from("playbooks")
    .select("document_id, preferences, updated_at")
    .eq("document_id", documentId)
    .maybeSingle();

  if (error) {
    console.error(`[playbook] fetch_failed id=${documentId}`);
    throw new DocumentServiceError("database_error", "Failed to fetch playbook.", 500);
  }

  if (!row) {
    return {
      document_id: documentId,
      saved: false,
      playbook: cloneDefaultPlaybook(),
      updated_at: null,
    };
  }

  const parsed = playbookSchema.safeParse(row.preferences);
  return {
    document_id: documentId,
    saved: true,
    playbook: parsed.success ? parsed.data : cloneDefaultPlaybook(),
    updated_at: row.updated_at,
  };
}

export async function saveDocumentPlaybook(
  documentId: string,
  rawInput: unknown,
): Promise<PlaybookResponseDto> {
  if (typeof rawInput !== "object" || rawInput === null || Array.isArray(rawInput)) {
    throw new DocumentServiceError(
      "invalid_playbook",
      "Playbook payload must be a JSON object.",
      400,
      { playbook: "Playbook payload must be a JSON object." },
    );
  }

  const parsed = playbookSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fields = formatPlaybookFieldErrors(parsed.error);
    const firstMessage =
      Object.entries(fields)
        .map(([key, msg]) => `${key}: ${msg}`)
        .join("; ") || "Invalid playbook preferences.";

    console.warn(`[playbook] validation_failed id=${documentId}`);
    throw new DocumentServiceError("invalid_playbook", firstMessage, 400, fields);
  }

  await assertDocumentExists(documentId);

  const supabase = getAdminClientOrThrow();
  const { data: row, error } = await supabase
    .from("playbooks")
    .upsert(
      {
        document_id: documentId,
        preferences: parsed.data,
      },
      { onConflict: "document_id" },
    )
    .select("document_id, preferences, updated_at")
    .single();

  if (error || !row) {
    console.error(`[playbook] save_failed id=${documentId}`);
    throw new DocumentServiceError("database_error", "Failed to save playbook.", 500);
  }

  console.info(`[playbook] saved id=${documentId}`);

  return {
    document_id: documentId,
    saved: true,
    playbook: row.preferences as PlaybookPreferences,
    updated_at: row.updated_at,
  };
}

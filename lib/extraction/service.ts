import { getServerEnv } from "@/lib/env";
import { getLlmClient, LlmError } from "@/lib/llm";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ClauseType } from "./types";
import {
  EXTRACTION_GEMINI_SCHEMA,
  EXTRACTION_SYSTEM_INSTRUCTION,
  buildExtractionUserPrompt,
} from "./prompt";
import {
  EXTRACTION_PROMPT_VERSION,
  extractionResponseSchema,
} from "./types";
import { verifyClauses } from "./verify";

export class ExtractionServiceError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ExtractionServiceError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface ExtractionRunDto {
  id: string;
  model: string;
  cached: boolean;
  proposed_count: number;
  accepted_count: number;
  rejected_count: number;
  latency_ms: number | null;
}

export interface ClauseDto {
  id: string;
  document_id: string;
  run_id: string;
  clause_type: ClauseType;
  verbatim_text: string;
  page_number: number;
  char_start: number;
  char_end: number;
  verbatim_verified: boolean;
  extraction_confidence: "low" | "medium" | "high";
  page_mismatch: boolean;
  created_at?: string;
}

export interface ExtractionResponseDto {
  run: ExtractionRunDto;
  clauses: ClauseDto[];
}

export async function extractDocumentClauses(
  documentId: string,
): Promise<ExtractionResponseDto> {
  const supabase = createSupabaseAdminClient();
  const env = getServerEnv();
  const primaryModel = env.LLM_MODEL;
  const fallbackModel = env.LLM_FALLBACK_MODEL;
  const maxPerHour = env.EXTRACT_MAX_PER_HOUR;
  const promptVersion = EXTRACTION_PROMPT_VERSION;

  // 1. Verify document exists and retrieve sha256
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, sha256")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) {
    console.error(`[extract] doc_lookup_failed id=${documentId}`);
    throw new ExtractionServiceError("database_error", "Failed to lookup document.", 500);
  }
  if (!doc) {
    throw new ExtractionServiceError("not_found", "Document not found.", 404);
  }

  const sha256 = doc.sha256 ?? "";

  // 2. Check for succeeded run cache hit for (sha256, prompt_version, model: primary OR fallback)
  if (sha256) {
    const modelsToMatch = [primaryModel];
    if (fallbackModel && fallbackModel !== primaryModel) {
      modelsToMatch.push(fallbackModel);
    }

    const { data: cachedRun, error: cacheLookupError } = await supabase
      .from("extraction_runs")
      .select("id, model, proposed_count, accepted_count, rejected")
      .eq("sha256", sha256)
      .eq("prompt_version", promptVersion)
      .in("model", modelsToMatch)
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!cacheLookupError && cachedRun) {
      // Re-use cached run: create a new run row with cached_from_run_id, copy clauses
      const { data: newRun, error: createRunError } = await supabase
        .from("extraction_runs")
        .insert({
          document_id: documentId,
          sha256,
          prompt_version: promptVersion,
          model: cachedRun.model,
          status: "succeeded",
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          latency_ms: 0,
          proposed_count: cachedRun.proposed_count,
          accepted_count: cachedRun.accepted_count,
          rejected: cachedRun.rejected,
          cached_from_run_id: cachedRun.id,
        })
        .select("id, model, proposed_count, accepted_count, rejected, latency_ms")
        .single();

      if (createRunError || !newRun) {
        console.error(`[extract] cached_run_create_failed id=${documentId}`);
        throw new ExtractionServiceError("database_error", "Failed to record cached extraction run.", 500);
      }

      // Fetch clauses from the original run
      const { data: origClauses, error: origClausesError } = await supabase
        .from("clauses")
        .select(
          "clause_type, verbatim_text, page_number, char_start, char_end, verbatim_verified, extraction_confidence, page_mismatch",
        )
        .eq("run_id", cachedRun.id)
        .order("page_number", { ascending: true })
        .order("char_start", { ascending: true });

      if (origClausesError) {
        console.error(`[extract] copy_clauses_fetch_failed run_id=${cachedRun.id}`);
        throw new ExtractionServiceError("database_error", "Failed to fetch cached clauses.", 500);
      }

      let copiedClauses: ClauseDto[] = [];
      if (origClauses && origClauses.length > 0) {
        const rowsToInsert = origClauses.map((c) => ({
          document_id: documentId,
          run_id: newRun.id,
          clause_type: c.clause_type,
          verbatim_text: c.verbatim_text,
          page_number: c.page_number,
          char_start: c.char_start,
          char_end: c.char_end,
          verbatim_verified: c.verbatim_verified ?? true,
          extraction_confidence: c.extraction_confidence,
          page_mismatch: c.page_mismatch ?? false,
        }));

        const { data: inserted, error: insertError } = await supabase
          .from("clauses")
          .insert(rowsToInsert)
          .select(
            "id, document_id, run_id, clause_type, verbatim_text, page_number, char_start, char_end, verbatim_verified, extraction_confidence, page_mismatch, created_at",
          );

        if (insertError) {
          console.error(`[extract] copy_clauses_insert_failed new_run_id=${newRun.id}`);
          throw new ExtractionServiceError("database_error", "Failed to store copied clauses.", 500);
        }

        copiedClauses = (inserted ?? []) as ClauseDto[];
      }

      const rejectedList = Array.isArray(newRun.rejected) ? newRun.rejected : [];
      return {
        run: {
          id: newRun.id,
          model: newRun.model,
          cached: true,
          proposed_count: newRun.proposed_count,
          accepted_count: newRun.accepted_count,
          rejected_count: rejectedList.length,
          latency_ms: newRun.latency_ms,
        },
        clauses: copiedClauses,
      };
    }
  }

  // 3. Local rate limit: count non-cached runs started in the last 60 minutes
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: hourlyCount, error: countError } = await supabase
    .from("extraction_runs")
    .select("id", { count: "exact", head: true })
    .is("cached_from_run_id", null)
    .gte("started_at", oneHourAgo);

  if (!countError && hourlyCount !== null && hourlyCount >= maxPerHour) {
    throw new ExtractionServiceError(
      "rate_limited_local",
      "Local extraction hourly limit exceeded. Please wait before running another extraction.",
      429,
    );
  }

  // 4. In-progress check: if a 'running' run started < 3 minutes ago
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  // Mark stale running runs older than 3 minutes as failed
  await supabase
    .from("extraction_runs")
    .update({
      status: "failed",
      error_code: "stale",
      finished_at: new Date().toISOString(),
    })
    .eq("document_id", documentId)
    .eq("status", "running")
    .lt("started_at", threeMinutesAgo);

  const { data: runningRuns, error: runningError } = await supabase
    .from("extraction_runs")
    .select("id")
    .eq("document_id", documentId)
    .eq("status", "running")
    .gte("started_at", threeMinutesAgo)
    .limit(1);

  if (!runningError && runningRuns && runningRuns.length > 0) {
    throw new ExtractionServiceError(
      "extraction_in_progress",
      "An extraction is already running for this document.",
      409,
    );
  }

  // 5. Create 'running' run row
  const startTime = Date.now();
  const { data: createdRun, error: createError } = await supabase
    .from("extraction_runs")
    .insert({
      document_id: documentId,
      sha256,
      prompt_version: promptVersion,
      model: primaryModel,
      status: "running",
      started_at: new Date(startTime).toISOString(),
    })
    .select("id")
    .single();

  if (createError) {
    if (
      createError.code === "23505" ||
      (typeof createError.message === "string" && createError.message.includes("23505")) ||
      (typeof createError.details === "string" && createError.details.includes("idx_extraction_runs_running_unique"))
    ) {
      throw new ExtractionServiceError(
        "extraction_in_progress",
        "An extraction is already running for this document.",
        409,
      );
    }
    console.error(`[extract] run_create_failed id=${documentId}`, createError);
    throw new ExtractionServiceError("database_error", "Failed to initialize extraction run.", 500);
  }

  if (!createdRun) {
    console.error(`[extract] run_create_failed id=${documentId}`);
    throw new ExtractionServiceError("database_error", "Failed to initialize extraction run.", 500);
  }

  const runId = createdRun.id;
  let runFinalized = false;

  try {
    // 6. Load document pages
    const { data: pageRows, error: pagesError } = await supabase
      .from("document_pages")
      .select("page_number, text")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true });

    if (pagesError || !pageRows || pageRows.length === 0) {
      throw new ExtractionServiceError(
        "no_pages",
        "Document pages not found for extraction.",
        400,
      );
    }

    const pages = pageRows.map((p) => ({
      page_number: p.page_number as number,
      text: p.text as string,
    }));

    // 7. Call LLM
    const userPrompt = buildExtractionUserPrompt(pages);
    const llmClient = getLlmClient();

    const llmResult = await llmClient.generateJson({
      system: EXTRACTION_SYSTEM_INSTRUCTION,
      user: userPrompt,
      jsonSchema: EXTRACTION_GEMINI_SCHEMA,
    });

    const parsed = extractionResponseSchema.safeParse(llmResult.json);
    if (!parsed.success) {
      throw new LlmError(
        "llm_invalid_output",
        "LLM output failed schema validation.",
        502,
      );
    }

    // 8. Grounding verification
    const { accepted, rejected } = verifyClauses(parsed.data.clauses, pages);

    // 9. Store accepted clauses
    let storedClauses: ClauseDto[] = [];
    if (accepted.length > 0) {
      const rowsToInsert = accepted.map((c) => ({
        document_id: documentId,
        run_id: runId,
        clause_type: c.clause_type,
        verbatim_text: c.verbatim_text,
        page_number: c.page_number,
        char_start: c.char_start,
        char_end: c.char_end,
        verbatim_verified: true,
        extraction_confidence: c.extraction_confidence,
        page_mismatch: c.page_mismatch,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from("clauses")
        .insert(rowsToInsert)
        .select(
          "id, document_id, run_id, clause_type, verbatim_text, page_number, char_start, char_end, verbatim_verified, extraction_confidence, page_mismatch, created_at",
        );

      if (insertError) {
        console.error(`[extract] clause_insert_failed run_id=${runId}`);
        throw new ExtractionServiceError("database_error", "Failed to store extracted clauses.", 500);
      }

      storedClauses = (inserted ?? []) as ClauseDto[];
    }

    const latencyMs = Date.now() - startTime;
    const actualModel = llmResult.model;

    // 10. Mark run succeeded
    const { error: updateError } = await supabase
      .from("extraction_runs")
      .update({
        model: actualModel,
        status: "succeeded",
        finished_at: new Date().toISOString(),
        latency_ms: latencyMs,
        input_tokens: llmResult.usage.inputTokens ?? null,
        output_tokens: llmResult.usage.outputTokens ?? null,
        proposed_count: parsed.data.clauses.length,
        accepted_count: accepted.length,
        rejected: rejected,
      })
      .eq("id", runId);

    if (updateError) {
      console.error(`[extract] run_success_update_failed run_id=${runId}`);
    }

    runFinalized = true;
    console.log(
      `[extract] succeeded doc=${documentId} run=${runId} model=${actualModel} proposed=${parsed.data.clauses.length} accepted=${accepted.length} rejected=${rejected.length} latency=${latencyMs}ms`,
    );

    return {
      run: {
        id: runId,
        model: actualModel,
        cached: false,
        proposed_count: parsed.data.clauses.length,
        accepted_count: accepted.length,
        rejected_count: rejected.length,
        latency_ms: latencyMs,
      },
      clauses: storedClauses,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    let errorCode = "internal_error";

    if (err instanceof LlmError) {
      errorCode = err.code;
    } else if (err instanceof ExtractionServiceError) {
      errorCode = err.code;
    }

    await supabase
      .from("extraction_runs")
      .update({
        status: "failed",
        error_code: errorCode,
        finished_at: new Date().toISOString(),
        latency_ms: latencyMs,
      })
      .eq("id", runId);

    runFinalized = true;
    console.error(`[extract] failed doc=${documentId} run=${runId} code=${errorCode}`);
    throw err;
  } finally {
    // Ensure run never stays 'running'
    if (!runFinalized) {
      await supabase
        .from("extraction_runs")
        .update({
          status: "failed",
          error_code: "internal_error",
          finished_at: new Date().toISOString(),
          latency_ms: Date.now() - startTime,
        })
        .eq("id", runId)
        .eq("status", "running");
    }
  }
}

export async function getDocumentClauses(
  documentId: string,
): Promise<ExtractionResponseDto | { run: null; clauses: [] }> {
  const supabase = createSupabaseAdminClient();

  // Verify document exists
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) {
    console.error(`[clauses] doc_lookup_failed id=${documentId}`);
    throw new ExtractionServiceError("database_error", "Failed to lookup document.", 500);
  }
  if (!doc) {
    throw new ExtractionServiceError("not_found", "Document not found.", 404);
  }

  // Find latest succeeded run
  const { data: latestRun, error: runError } = await supabase
    .from("extraction_runs")
    .select(
      "id, model, proposed_count, accepted_count, rejected, cached_from_run_id, latency_ms",
    )
    .eq("document_id", documentId)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    console.error(`[clauses] run_lookup_failed id=${documentId}`);
    throw new ExtractionServiceError("database_error", "Failed to fetch extraction run.", 500);
  }

  if (!latestRun) {
    return { run: null, clauses: [] };
  }

  // Fetch clauses for this run, ordered by page_number then char_start
  const { data: clauseRows, error: clausesError } = await supabase
    .from("clauses")
    .select(
      "id, document_id, run_id, clause_type, verbatim_text, page_number, char_start, char_end, verbatim_verified, extraction_confidence, page_mismatch, created_at",
    )
    .eq("run_id", latestRun.id)
    .order("page_number", { ascending: true })
    .order("char_start", { ascending: true });

  if (clausesError) {
    console.error(`[clauses] fetch_failed run_id=${latestRun.id}`);
    throw new ExtractionServiceError("database_error", "Failed to fetch clauses.", 500);
  }

  const rejectedList = Array.isArray(latestRun.rejected) ? latestRun.rejected : [];

  return {
    run: {
      id: latestRun.id,
      model: latestRun.model,
      cached: Boolean(latestRun.cached_from_run_id),
      proposed_count: latestRun.proposed_count,
      accepted_count: latestRun.accepted_count,
      rejected_count: rejectedList.length,
      latency_ms: latestRun.latency_ms,
    },
    clauses: (clauseRows ?? []) as ClauseDto[],
  };
}

import { getServerEnv } from "@/lib/env";
import { type LlmClient, LlmError, getLlmClient } from "@/lib/llm";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ClauseRow } from "@/lib/supabase/types";
import {
  FACTS_GEMINI_SCHEMA,
  FACTS_PROMPT_VERSION,
  FACTS_SYSTEM_INSTRUCTION,
  buildFactsUserPrompt,
} from "./prompt";
import {
  type AnyClauseFacts,
  type DroppedClauseFact,
  areAllFactFieldsNullOrUnspecified,
  factsResponseSchema,
  filterFactsForClauseType,
  getDefaultFactsForType,
} from "./types";
import { verifyFactEvidenceQuote } from "./verify";
import { applyLexicalBackstop } from "./backstops";

export class FactsServiceError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 500) {
    super(message);
    this.name = "FactsServiceError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface EnsureFactsResult {
  cached: boolean;
  facts_run_id: string | null;
  model: string;
  clause_count: number;
  verified_count: number;
  no_facts_count: number;
  failed_count: number;
  dropped_count: number;
  clauses: ClauseRow[];
}

export interface EnsureFactsOptions {
  llmClient?: LlmClient;
}

export async function ensureDocumentFacts(
  documentId: string,
  options?: EnsureFactsOptions,
): Promise<EnsureFactsResult> {
  const supabase = createSupabaseAdminClient();
  const env = getServerEnv();
  const maxPerHour = env.EXTRACT_MAX_PER_HOUR;
  const primaryModel = env.LLM_MODEL;

  // 1. Verify document exists
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) {
    console.error(`[facts] doc_lookup_failed id=${documentId}`);
    throw new FactsServiceError("database_error", "Failed to lookup document.", 500);
  }
  if (!doc) {
    throw new FactsServiceError("not_found", "Document not found.", 404);
  }

  // 2. Fetch latest succeeded extraction run
  const { data: latestExtractionRun, error: runError } = await supabase
    .from("extraction_runs")
    .select("id, model, status")
    .eq("document_id", documentId)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    console.error(`[facts] extraction_run_lookup_failed id=${documentId}`);
    throw new FactsServiceError("database_error", "Failed to lookup extraction run.", 500);
  }
  if (!latestExtractionRun) {
    throw new FactsServiceError("no_clauses", "No extracted clauses found for this document.", 409);
  }

  // 3. Fetch clauses of that run
  const { data: clausesData, error: clausesError } = await supabase
    .from("clauses")
    .select("*")
    .eq("run_id", latestExtractionRun.id)
    .order("page_number", { ascending: true })
    .order("char_start", { ascending: true });

  if (clausesError) {
    console.error(`[facts] clauses_fetch_failed id=${documentId}`);
    throw new FactsServiceError("database_error", "Failed to fetch clauses.", 500);
  }

  const clauses = (clausesData ?? []) as ClauseRow[];
  if (clauses.length === 0) {
    throw new FactsServiceError("no_clauses", "No extracted clauses found for this document.", 409);
  }

  // Fetch document page texts for cross-clause/page evidence verification
  const { data: pageRows, error: pagesError } = await supabase
    .from("document_pages")
    .select("page_number, text")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });

  if (pagesError) {
    console.error(`[facts] pages_fetch_failed id=${documentId}`);
  }
  const pageTexts = (pageRows ?? []).map((p) => p.text);

  // 4. Cache check: if every clause has facts_prompt_version === FACTS_PROMPT_VERSION and facts_status !== null
  const isAllCached = clauses.every(
    (c) => c.facts_prompt_version === FACTS_PROMPT_VERSION && c.facts_status !== null,
  );

  if (isAllCached) {
    const verifiedCount = clauses.filter((c) => c.facts_status === "extracted").length;
    const noFactsCount = clauses.filter((c) => c.facts_status === "none").length;
    const failedCount = clauses.filter((c) => c.facts_status === "failed").length;
    return {
      cached: true,
      facts_run_id: null,
      model: latestExtractionRun.model,
      clause_count: clauses.length,
      verified_count: verifiedCount,
      no_facts_count: noFactsCount,
      failed_count: failedCount,
      dropped_count: failedCount,
      clauses,
    };
  }

  // 5. Rate limit: count non-cached extraction_runs AND facts_runs started in last 60 minutes
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [extractCountRes, factsCountRes] = await Promise.all([
    supabase
      .from("extraction_runs")
      .select("id", { count: "exact", head: true })
      .is("cached_from_run_id", null)
      .gte("started_at", oneHourAgo),
    supabase
      .from("facts_runs")
      .select("id", { count: "exact", head: true })
      .gte("started_at", oneHourAgo),
  ]);

  const totalHourly = (extractCountRes.count ?? 0) + (factsCountRes.count ?? 0);
  if (totalHourly >= maxPerHour) {
    throw new FactsServiceError(
      "rate_limited_local",
      "Local extraction hourly limit exceeded. Please wait before running another extraction.",
      429,
    );
  }

  // 6. Stale running lock cleanup (> 3 minutes ago)
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await supabase
    .from("facts_runs")
    .update({
      status: "failed",
      error_code: "stale",
      finished_at: new Date().toISOString(),
    })
    .eq("document_id", documentId)
    .eq("status", "running")
    .lt("started_at", threeMinutesAgo);

  // 7. Active running lock check (< 3 minutes)
  const { data: runningRun } = await supabase
    .from("facts_runs")
    .select("id, started_at")
    .eq("document_id", documentId)
    .eq("status", "running")
    .gte("started_at", threeMinutesAgo)
    .maybeSingle();

  if (runningRun) {
    throw new FactsServiceError(
      "analysis_in_progress",
      "A risk analysis is already running for this document.",
      409,
    );
  }

  // 8. Create new facts_runs row
  const startTime = Date.now();
  const { data: newFactsRun, error: createRunError } = await supabase
    .from("facts_runs")
    .insert({
      document_id: documentId,
      extraction_run_id: latestExtractionRun.id,
      prompt_version: FACTS_PROMPT_VERSION,
      model: primaryModel,
      status: "running",
      started_at: new Date(startTime).toISOString(),
      clause_count: clauses.length,
      verified_count: 0,
      no_facts_count: 0,
      failed_count: 0,
      dropped: [],
    })
    .select("id")
    .single();

  if (createRunError || !newFactsRun) {
    if (createRunError?.code === "23505") {
      throw new FactsServiceError(
        "analysis_in_progress",
        "A risk analysis is already running for this document.",
        409,
      );
    }
    console.error(`[facts] run_create_failed id=${documentId}`);
    throw new FactsServiceError("database_error", "Failed to start facts run.", 500);
  }

  const factsRunId = newFactsRun.id;
  let runFinalized = false;

  try {
    // 9. Build prompt
    const { promptText, markerMap } = buildFactsUserPrompt(
      clauses.map((c) => ({
        id: c.id,
        clause_type: c.clause_type,
        page_number: c.page_number,
        verbatim_text: c.verbatim_text,
      })),
    );

    // 10. Call LLM
    const llmClient = options?.llmClient ?? getLlmClient();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const llmResult = await llmClient.generateJson<{ items?: unknown[] }>({
      system: FACTS_SYSTEM_INSTRUCTION,
      user: promptText,
      jsonSchema: FACTS_GEMINI_SCHEMA,
    });
    totalInputTokens += llmResult.usage.inputTokens ?? 0;
    totalOutputTokens += llmResult.usage.outputTokens ?? 0;

    const parsed = factsResponseSchema.safeParse(llmResult.json);
    if (!parsed.success) {
      console.error(`[facts] invalid_llm_output run_id=${factsRunId}`);
      throw new LlmError(
        "llm_invalid_output",
        "LLM output could not be parsed according to the facts schema.",
        502,
      );
    }

    // 11. Map items from Call 1 back to clauses
    const seenMarkers = new Set<string>();
    const clauseItemsMap = new Map<
      string,
      (typeof parsed.data.items)[number]
    >();

    for (const item of parsed.data.items) {
      const marker = item.clause.trim().replace(/^\[+|\]+$/g, "");
      if (seenMarkers.has(marker)) {
        continue; // ignore duplicates
      }
      seenMarkers.add(marker);

      const clauseTarget = markerMap.get(marker);
      if (clauseTarget) {
        clauseItemsMap.set(clauseTarget.id, item);
      }
    }

    // If markers are still absent after the first call, make ONE follow-up call containing only those clauses
    const absentClauses = clauses.filter((c) => !clauseItemsMap.has(c.id));
    if (absentClauses.length > 0) {
      try {
        const followUp = buildFactsUserPrompt(
          absentClauses.map((c) => ({
            id: c.id,
            clause_type: c.clause_type,
            page_number: c.page_number,
            verbatim_text: c.verbatim_text,
          })),
        );

        const followUpResult = await llmClient.generateJson<{ items?: unknown[] }>({
          system: FACTS_SYSTEM_INSTRUCTION,
          user: followUp.promptText,
          jsonSchema: FACTS_GEMINI_SCHEMA,
        });
        totalInputTokens += followUpResult.usage.inputTokens ?? 0;
        totalOutputTokens += followUpResult.usage.outputTokens ?? 0;

        const followUpParsed = factsResponseSchema.safeParse(followUpResult.json);
        if (followUpParsed.success) {
          const followUpSeen = new Set<string>();
          for (const item of followUpParsed.data.items) {
            const marker = item.clause.trim().replace(/^\[+|\]+$/g, "");
            if (followUpSeen.has(marker)) {
              continue;
            }
            followUpSeen.add(marker);
            const target = followUp.markerMap.get(marker);
            if (target && !clauseItemsMap.has(target.id)) {
              clauseItemsMap.set(target.id, item);
            }
          }
        }
      } catch (followUpErr) {
        // Fix 2: If the follow-up LLM call throws, do NOT fail the whole run.
        // Keep first call's results, step 12 will mark absent clauses failed with reason 'no_item'.
        console.warn("[facts] follow-up LLM call failed, proceeding with first call results", followUpErr);
      }
    }

    // 12. Process all clauses and classify: 'extracted' | 'none' | 'failed'
    const clauseFactsMap = new Map<
      string,
      {
        facts: AnyClauseFacts;
        facts_evidence: string | null;
        facts_verified: boolean;
        facts_status: "extracted" | "none" | "failed";
      }
    >();

    const dropped: DroppedClauseFact[] = [];
    let verifiedCount = 0;
    let noFactsCount = 0;
    let failedCount = 0;

    for (const clause of clauses) {
      const item = clauseItemsMap.get(clause.id);

      if (!item) {
        // Item absent -> 'failed' with reason no_item
        clauseFactsMap.set(clause.id, {
          facts: getDefaultFactsForType(clause.clause_type),
          facts_evidence: null,
          facts_verified: false,
          facts_status: "failed",
        });
        dropped.push({
          clause_id: clause.id,
          clause_type: clause.clause_type,
          reason: "no_item",
          evidence_length: 0,
        });
        failedCount++;
        continue;
      }

      const filteredFacts = filterFactsForClauseType(
        clause.clause_type,
        item.facts,
      );

      const allNullOrUnspecified = areAllFactFieldsNullOrUnspecified(filteredFacts);
      const evidenceEmpty = !item.evidence_quote || item.evidence_quote.trim().length === 0;

      if (allNullOrUnspecified && evidenceEmpty) {
        // item present, all fields null/unspecified after filtering, evidence empty -> 'none' (no evidence needed, not a failure)
        clauseFactsMap.set(clause.id, {
          facts: filteredFacts,
          facts_evidence: null,
          facts_verified: false,
          facts_status: "none",
        });
        noFactsCount++;
      } else {
        // Item present with at least one non-unspecified value -> needs verified evidence
        const otherClausesTexts = clauses
          .filter((c) => c.id !== clause.id)
          .map((c) => c.verbatim_text);

        const verifyResult = verifyFactEvidenceQuote(
          clause.verbatim_text,
          clause.char_start ?? 0,
          item.evidence_quote,
          otherClausesTexts,
          pageTexts,
        );

        if (verifyResult.valid) {
          if (allNullOrUnspecified) {
            clauseFactsMap.set(clause.id, {
              facts: filteredFacts,
              facts_evidence: null,
              facts_verified: false,
              facts_status: "none",
            });
            noFactsCount++;
          } else {
            clauseFactsMap.set(clause.id, {
              facts: filteredFacts,
              facts_evidence: verifyResult.quote,
              facts_verified: true,
              facts_status: "extracted",
            });
            verifiedCount++;
          }
        } else {
          if (allNullOrUnspecified) {
            // Fix 1: If model returns an item where all fields are null/unspecified and quote fails verification,
            // classify it 'none', not 'failed' (nothing was asserted).
            clauseFactsMap.set(clause.id, {
              facts: filteredFacts,
              facts_evidence: null,
              facts_verified: false,
              facts_status: "none",
            });
            noFactsCount++;
          } else {
            // Item with real values and bad/missing evidence stays 'failed'
            clauseFactsMap.set(clause.id, {
              facts: getDefaultFactsForType(clause.clause_type),
              facts_evidence: null,
              facts_verified: false,
              facts_status: "failed",
            });
            dropped.push({
              clause_id: clause.id,
              clause_type: clause.clause_type,
              reason: verifyResult.reason,
              evidence_length: verifyResult.evidence_length,
            });
            failedCount++;
          }
        }
      }
    }

    // 12b. Lexical backstops for termination clauses
    let backstopCount = 0;
    for (const clause of clauses) {
      if (clause.clause_type === "termination") {
        const computed = clauseFactsMap.get(clause.id)!;
        const otherClausesTexts = clauses
          .filter((c) => c.id !== clause.id)
          .map((c) => c.verbatim_text);

        const backstopResult = applyLexicalBackstop(
          clause,
          computed,
          otherClausesTexts,
          pageTexts,
        );

        if (backstopResult.applied) {
          backstopCount++;
          const prevStatus = computed.facts_status;
          clauseFactsMap.set(clause.id, backstopResult.computed);

          if (prevStatus === "none") {
            noFactsCount--;
            verifiedCount++;
          } else if (prevStatus === "failed") {
            failedCount--;
            verifiedCount++;
            const dropIdx = dropped.findIndex((d) => d.clause_id === clause.id);
            if (dropIdx !== -1) {
              dropped.splice(dropIdx, 1);
            }
          }
        }
      }
    }

    // 13. Update clauses in DB
    const updatedClauses: ClauseRow[] = [];
    for (const clause of clauses) {
      const computed = clauseFactsMap.get(clause.id)!;
      const { data: updated, error: updateClauseError } = await supabase
        .from("clauses")
        .update({
          facts: computed.facts,
          facts_evidence: computed.facts_evidence,
          facts_verified: computed.facts_verified,
          facts_status: computed.facts_status,
          facts_prompt_version: FACTS_PROMPT_VERSION,
        })
        .eq("id", clause.id)
        .select("*")
        .single();

      if (updateClauseError || !updated) {
        console.error(`[facts] clause_update_failed clause_id=${clause.id}`);
        throw new FactsServiceError("database_error", "Failed to update clause facts.", 500);
      }
      updatedClauses.push(updated as ClauseRow);
    }

    // 14. Mark facts_run succeeded
    const latencyMs = Date.now() - startTime;
    const actualModel = llmResult.model;

    await supabase
      .from("facts_runs")
      .update({
        model: actualModel,
        status: "succeeded",
        finished_at: new Date().toISOString(),
        latency_ms: latencyMs,
        input_tokens: totalInputTokens || null,
        output_tokens: totalOutputTokens || null,
        verified_count: verifiedCount,
        no_facts_count: noFactsCount,
        failed_count: failedCount,
        dropped,
      })
      .eq("id", factsRunId);

    runFinalized = true;
    console.log(
      `[facts] succeeded doc=${documentId} run=${factsRunId} model=${actualModel} total=${clauses.length} verified=${verifiedCount} backstops=${backstopCount} dropped=${dropped.length} latency=${latencyMs}ms`,
    );

    return {
      cached: false,
      facts_run_id: factsRunId,
      model: actualModel,
      clause_count: clauses.length,
      verified_count: verifiedCount,
      no_facts_count: noFactsCount,
      failed_count: failedCount,
      dropped_count: failedCount,
      clauses: updatedClauses,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    let errorCode = "internal_error";
    if (err instanceof LlmError) {
      errorCode = err.code;
    } else if (err instanceof FactsServiceError) {
      errorCode = err.code;
    }

    await supabase
      .from("facts_runs")
      .update({
        status: "failed",
        error_code: errorCode,
        finished_at: new Date().toISOString(),
        latency_ms: latencyMs,
      })
      .eq("id", factsRunId);

    runFinalized = true;
    console.error(`[facts] failed doc=${documentId} run=${factsRunId} code=${errorCode}`);
    throw err;
  } finally {
    if (!runFinalized) {
      await supabase
        .from("facts_runs")
        .update({
          status: "failed",
          error_code: "internal_error",
          finished_at: new Date().toISOString(),
          latency_ms: Date.now() - startTime,
        })
        .eq("id", factsRunId)
        .eq("status", "running");
    }
  }
}

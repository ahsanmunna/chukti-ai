import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isValidUuid, jsonError } from "@/lib/api/responses";
import { ensureDocumentFacts, FactsServiceError } from "@/lib/facts";
import { LlmError } from "@/lib/llm";
import { DEFAULT_PLAYBOOK, type PlaybookPreferences } from "@/lib/playbook/schema";
import { evaluateRiskRules, type ClauseWithFacts } from "@/lib/risk";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { FindingRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return jsonError(400, "invalid_id", "Document ID must be a valid UUID.");
  }

  const supabase = createSupabaseAdminClient();

  try {
    // 1. Ensure facts (LLM only if not cached)
    const factsResult = await ensureDocumentFacts(id);

    // 2. Fetch latest succeeded extraction run for this document to link findings
    const { data: latestExtractionRun } = await supabase
      .from("extraction_runs")
      .select("id")
      .eq("document_id", id)
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestExtractionRun) {
      return jsonError(409, "no_clauses", "No extraction clauses available to analyze.");
    }

    // 3. Load saved playbook (or defaults)
    const { data: savedPlaybookRow } = await supabase
      .from("playbooks")
      .select("preferences")
      .eq("document_id", id)
      .maybeSingle();

    const isDefault = !savedPlaybookRow || !savedPlaybookRow.preferences;
    const activePlaybook: PlaybookPreferences = isDefault
      ? {
          liability_cap: { ...DEFAULT_PLAYBOOK.liability_cap },
          payment_terms: { ...DEFAULT_PLAYBOOK.payment_terms },
          ip_ownership: DEFAULT_PLAYBOOK.ip_ownership,
          termination: { ...DEFAULT_PLAYBOOK.termination },
          scope_changes: { ...DEFAULT_PLAYBOOK.scope_changes },
        }
      : (savedPlaybookRow.preferences as PlaybookPreferences);

    const playbookSnapshot = {
      preferences: activePlaybook,
      is_default: isDefault,
    };

    // 4. Compute deterministic findings from facts and playbook
    const clausesWithFacts: ClauseWithFacts[] = factsResult.clauses.map((c) => ({
      id: c.id,
      document_id: c.document_id,
      run_id: c.run_id,
      clause_type: c.clause_type,
      verbatim_text: c.verbatim_text,
      page_number: c.page_number,
      char_start: c.char_start,
      char_end: c.char_end,
      verbatim_verified: c.verbatim_verified,
      extraction_confidence: c.extraction_confidence,
      page_mismatch: c.page_mismatch,
      facts: (c.facts as Record<string, unknown>) ?? null,
      facts_evidence: c.facts_evidence,
      facts_verified: c.facts_verified,
      facts_prompt_version: c.facts_prompt_version,
    }));

    const computedFindings = evaluateRiskRules(clausesWithFacts, activePlaybook);

    // 5. Replace document findings in one transaction via Postgres RPC
    const findingsPayload = computedFindings.map((f) => ({
      document_id: id,
      extraction_run_id: latestExtractionRun.id,
      facts_run_id: factsResult.facts_run_id,
      rules_version: f.rule_version,
      rule_id: f.rule_id,
      severity: f.severity,
      priority: f.priority,
      params: f.params,
      clause_ids: f.clause_ids,
      evidence: f.evidence,
      lawyer_review: f.lawyer_review,
      lawyer_review_reasons: f.lawyer_review_reasons,
      playbook_snapshot: playbookSnapshot,
    }));

    const { data: storedFindings, error: rpcError } = await supabase.rpc(
      "replace_document_findings",
      {
        p_document_id: id,
        p_findings: findingsPayload,
      },
    );

    if (rpcError) {
      console.error(`[analyze] replace_findings_rpc_failed id=${id}`);
      return jsonError(500, "database_error", "Failed to store analysis findings.");
    }

    const orderedStoredFindings = ((storedFindings ?? []) as FindingRow[]).sort(
      (a, b) => b.priority - a.priority,
    );

    return NextResponse.json(
      {
        run: {
          cached: factsResult.cached,
          verified_count: factsResult.verified_count,
          dropped_count: factsResult.dropped_count,
          model: factsResult.model,
        },
        findings: orderedStoredFindings,
        facts_summary: {
          total_clauses: factsResult.clause_count,
          verified_clauses: factsResult.verified_count,
          dropped_clauses: factsResult.dropped_count,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof FactsServiceError) {
      return jsonError(error.httpStatus, error.code, error.message);
    }
    if (error instanceof LlmError) {
      const statusMap: Record<string, number> = {
        llm_not_configured: 503,
        llm_rate_limited: 429,
        llm_unavailable: 503,
        llm_invalid_output: 502,
        llm_blocked: 422,
        llm_bad_request: 502,
      };
      const status = statusMap[error.code] ?? 500;
      return jsonError(status, error.code, error.message);
    }

    console.error(`[analyze] unexpected_error id=${id}`);
    return jsonError(500, "internal_error", "An unexpected error occurred during analysis.");
  }
}

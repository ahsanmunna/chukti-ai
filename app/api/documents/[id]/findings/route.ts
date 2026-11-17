import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isValidUuid, jsonError } from "@/lib/api/responses";
import { REGISTERED_RULE_IDS, type RuleId } from "@/lib/risk";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { FindingRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return jsonError(400, "invalid_id", "Document ID must be a valid UUID.");
  }

  const supabase = createSupabaseAdminClient();

  // Verify document exists
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (docError) {
    console.error(`[findings] doc_lookup_failed id=${id}`);
    return jsonError(500, "database_error", "Failed to lookup document.");
  }
  if (!doc) {
    return jsonError(404, "not_found", "Document not found.");
  }

  // Fetch findings for this document
  const { data: findingsData, error: findingsError } = await supabase
    .from("findings")
    .select("*")
    .eq("document_id", id)
    .order("priority", { ascending: false });

  if (findingsError) {
    console.error(`[findings] fetch_failed id=${id}`);
    return jsonError(500, "database_error", "Failed to fetch findings.");
  }

  const ruleOrderMap = new Map<RuleId, number>(
    REGISTERED_RULE_IDS.map((rId, index) => [rId, index]),
  );

  const findings = ((findingsData ?? []) as FindingRow[]).sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    const orderA = ruleOrderMap.get(a.rule_id as RuleId) ?? 999;
    const orderB = ruleOrderMap.get(b.rule_id as RuleId) ?? 999;
    return orderA - orderB;
  });

  // Compute facts summary from canonical clause facts status if available
  const { data: latestExtractionRun } = await supabase
    .from("extraction_runs")
    .select("id")
    .eq("document_id", id)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let factsSummary: {
    total_clauses: number;
    verified_clauses: number;
    extracted_clauses: number;
    no_facts_clauses: number;
    failed_clauses: number;
  } | null = null;

  if (latestExtractionRun) {
    const { data: clauses } = await supabase
      .from("clauses")
      .select("facts_status")
      .eq("run_id", latestExtractionRun.id);

    if (clauses && clauses.length > 0 && clauses.some((c) => c.facts_status !== null)) {
      const verifiedCount = clauses.filter((c) => c.facts_status === "extracted").length;
      const noFactsCount = clauses.filter((c) => c.facts_status === "none").length;
      const failedCount = clauses.filter((c) => c.facts_status === "failed").length;
      factsSummary = {
        total_clauses: clauses.length,
        verified_clauses: verifiedCount,
        extracted_clauses: verifiedCount,
        no_facts_clauses: noFactsCount,
        failed_clauses: failedCount,
      };
    }
  }

  // Fallback to latest succeeded facts run if clauses do not have facts_status populated
  if (!factsSummary) {
    const { data: latestFactsRun } = await supabase
      .from("facts_runs")
      .select("clause_count, verified_count, no_facts_count, failed_count")
      .eq("document_id", id)
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestFactsRun) {
      factsSummary = {
        total_clauses: latestFactsRun.clause_count,
        verified_clauses: latestFactsRun.verified_count,
        extracted_clauses: latestFactsRun.verified_count,
        no_facts_clauses: latestFactsRun.no_facts_count ?? 0,
        failed_clauses: latestFactsRun.failed_count ?? 0,
      };
    }
  }

  return NextResponse.json(
    {
      findings,
      facts_summary: factsSummary,
    },
    { status: 200 },
  );
}

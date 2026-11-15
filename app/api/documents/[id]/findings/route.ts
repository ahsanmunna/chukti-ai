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

  // Fetch latest succeeded facts run for clause counts
  const { data: latestFactsRun } = await supabase
    .from("facts_runs")
    .select("clause_count, verified_count")
    .eq("document_id", id)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(
    {
      findings,
      facts_summary: latestFactsRun
        ? {
            total_clauses: latestFactsRun.clause_count,
            verified_clauses: latestFactsRun.verified_count,
          }
        : null,
    },
    { status: 200 },
  );
}

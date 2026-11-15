import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as analyzeDocument } from "@/app/api/documents/[id]/analyze/route";
import { POST as extractClauses } from "@/app/api/documents/[id]/extract/route";
import { GET as getFindings } from "@/app/api/documents/[id]/findings/route";
import { PUT as updatePlaybook } from "@/app/api/documents/[id]/playbook/route";
import { POST as uploadDocument } from "@/app/api/documents/route";
import {
  type GenerateJsonOptions,
  type GenerateJsonResult,
  type LlmClient,
  LlmError,
  setLlmClientForTesting,
} from "@/lib/llm";
import { CONTRACTS_STORAGE_BUCKET } from "@/lib/pdf";
import { DEFAULT_PLAYBOOK } from "@/lib/playbook/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ClauseRow, FactsRunRow, FindingRow } from "@/lib/supabase/types";
import { generateSyntheticFixtures, type GeneratedFixturePaths } from "./generate-fixtures";

function loadLocalEnvIfPresent() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envLocalPath);
  }
}

class FakeLlmClient implements LlmClient {
  public callCount = 0;
  public factsCallCount = 0;
  public delayMs = 0;
  public cannedClauses: Array<{
    clause_type: string;
    quote: string;
    page_hint: number;
    confidence: "low" | "medium" | "high";
  }> = [];
  public cannedFactsItems: Array<{
    clause: string;
    evidence_quote: string;
    facts: Record<string, unknown>;
  }> = [];
  public failureError: Error | null = null;

  async generateJson<T = unknown>(options: GenerateJsonOptions): Promise<GenerateJsonResult<T>> {
    this.callCount++;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.failureError) {
      throw this.failureError;
    }

    const isFactsCall =
      options.system.includes("facts") ||
      (options.jsonSchema &&
        typeof options.jsonSchema === "object" &&
        "properties" in options.jsonSchema &&
        "items" in (options.jsonSchema.properties as Record<string, unknown>));

    if (isFactsCall) {
      this.factsCallCount++;
      return {
        json: { items: this.cannedFactsItems } as T,
        usage: { inputTokens: 400, outputTokens: 150 },
        model: process.env.LLM_MODEL || "gemini-3.6-flash",
      };
    }

    return {
      json: { clauses: this.cannedClauses } as T,
      usage: { inputTokens: 250, outputTokens: 110 },
      model: process.env.LLM_MODEL || "gemini-3.6-flash",
    };
  }
}

function buildUploadRequest(fileBytes: Uint8Array, filename: string, mimeType: string) {
  const formData = new FormData();
  const blob = new File([Buffer.from(fileBytes)], filename, { type: mimeType });
  formData.append("file", blob);

  return new NextRequest("http://localhost:3000/api/documents", {
    method: "POST",
    body: formData,
  });
}

describe("Phase 3 API Integration (Facts Extraction + Rule Engine + Findings + RLS)", () => {
  let fixtures: GeneratedFixturePaths;
  const createdDocs: Array<{ id: string; storagePath: string }> = [];
  const fakeLlm = new FakeLlmClient();

  beforeAll(async () => {
    loadLocalEnvIfPresent();
    fixtures = await generateSyntheticFixtures();
    setLlmClientForTesting(fakeLlm);
  });

  afterEach(() => {
    fakeLlm.callCount = 0;
    fakeLlm.factsCallCount = 0;
    fakeLlm.delayMs = 0;
    fakeLlm.cannedClauses = [];
    fakeLlm.cannedFactsItems = [];
    fakeLlm.failureError = null;
  });

  afterAll(async () => {
    setLlmClientForTesting(null);
    if (createdDocs.length === 0) {
      return;
    }
    try {
      const admin = createSupabaseAdminClient();
      const paths = createdDocs.map((d) => d.storagePath).filter(Boolean);
      if (paths.length > 0) {
        await admin.storage.from(CONTRACTS_STORAGE_BUCKET).remove(paths);
      }
      for (const doc of createdDocs) {
        await admin.from("documents").delete().eq("id", doc.id);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  async function uploadTestDoc(customName?: string): Promise<{ id: string; sha256: string }> {
    const rawBytes = new Uint8Array(fs.readFileSync(fixtures.textPdf));
    const filename = customName ?? `phase3-test-${crypto.randomUUID()}.pdf`;
    const uploadReq = buildUploadRequest(rawBytes, filename, "application/pdf");
    const uploadRes = await uploadDocument(uploadReq);
    const uploadJson = await uploadRes.json();
    expect(uploadRes.status).toBe(201);
    const docId = uploadJson.document.id;

    // Assign a unique sha256 so fresh extractions run without hitting earlier test caches
    const uniqueSha = crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex");
    const admin = createSupabaseAdminClient();
    await admin.from("documents").update({ sha256: uniqueSha }).eq("id", docId);

    createdDocs.push({
      id: docId,
      storagePath: uploadJson.document.storage_path ?? `${docId}/${filename}`,
    });
    return { id: docId, sha256: uniqueSha };
  }

  it("stores verified facts, drops fabricated quotes, ignores unknown markers, and produces findings", async () => {
    const { id: docId } = await uploadTestDoc();
    const admin = createSupabaseAdminClient();

    // 1. Extract 3 clauses from the synthetic document
    fakeLlm.cannedClauses = [
      {
        clause_type: "payment",
        quote: "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
        page_hint: 2,
        confidence: "high",
      },
      {
        clause_type: "liability",
        quote: "Neither party limits financial liability for direct, indirect, or consequential project damages.",
        page_hint: 3,
        confidence: "high",
      },
      {
        clause_type: "scope_change",
        quote: "Any expansion of deliverables, schedule, or technical milestones requires a signed written change order.",
        page_hint: 1,
        confidence: "high",
      },
    ];

    const extractRes = await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(extractRes.status).toBe(200);

    // Fetch the 3 clauses from DB to know their order
    const { data: clausesData } = await admin
      .from("clauses")
      .select("id, clause_type, verbatim_text")
      .eq("document_id", docId)
      .order("page_number", { ascending: true })
      .order("char_start", { ascending: true });

    expect(clausesData).toHaveLength(3);
    // Page 1: scope_change (C1)
    // Page 2: payment (C2)
    // Page 3: liability (C3)

    // 2. Prepare canned facts:
    // C1: valid evidence quote
    // C2: valid evidence quote
    // C3: FABRICATED evidence quote (should be dropped!)
    // C999: unknown marker (should be ignored cleanly!)
    fakeLlm.cannedFactsItems = [
      {
        clause: "[[C1]]", // scope_change
        evidence_quote: "requires a signed written change order",
        facts: {
          written_change_order_required: "yes",
          extra_work_without_additional_fee: "no",
        },
      },
      {
        clause: "[[C2]]", // payment
        evidence_quote: "within forty-five (45) calendar days from receipt of invoice",
        facts: {
          days_to_pay: 45,
          payment_trigger: "invoice_receipt",
          client_may_withhold: "no",
          total_fee_amount: null,
          currency: null,
        },
      },
      {
        clause: "[[C3]]", // liability
        evidence_quote: "This is a completely fabricated quote that does not appear anywhere in the contract text.",
        facts: {
          contractor_liability: "unlimited",
          cap_multiple_of_fees: null,
        },
      },
      {
        clause: "[[C999]]", // Unknown marker
        evidence_quote: "something random",
        facts: {},
      },
    ];

    // 3. Call POST /api/documents/[id]/analyze
    const analyzeRes = await analyzeDocument(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/analyze`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    expect(analyzeRes.status).toBe(200);
    const analyzeJson = await analyzeRes.json();

    // Verify run response
    expect(analyzeJson.run.cached).toBe(false);
    expect(analyzeJson.run.verified_count).toBe(2);
    expect(analyzeJson.run.dropped_count).toBe(1);
    expect(analyzeJson.findings.length).toBeGreaterThan(0);

    // Verify clauses row updates in DB
    const { data: updatedClauses } = await admin
      .from("clauses")
      .select("*")
      .eq("document_id", docId)
      .order("page_number", { ascending: true });

    const clauses = updatedClauses as ClauseRow[];
    expect(clauses[0].facts_verified).toBe(true);
    expect(clauses[0].facts_prompt_version).toBe("v2");
    expect(clauses[0].facts_evidence).toBe("requires a signed written change order");

    expect(clauses[1].facts_verified).toBe(true);
    expect(clauses[1].facts_prompt_version).toBe("v2");
    expect(clauses[1].facts_evidence).toBe("within forty-five (45) calendar days from receipt of invoice");

    // Dropped clause (C3): facts_verified = false, facts_evidence = null, all fields unspecified/null
    expect(clauses[2].facts_verified).toBe(false);
    expect(clauses[2].facts_prompt_version).toBe("v2");
    expect(clauses[2].facts_evidence).toBeNull();
    const c3Facts = clauses[2].facts as Record<string, unknown>;
    expect(c3Facts.contractor_liability).toBe("unspecified");

    // Verify facts_runs row
    const { data: factsRunRow } = await admin
      .from("facts_runs")
      .select("*")
      .eq("document_id", docId)
      .single();

    const factsRun = factsRunRow as FactsRunRow;
    expect(factsRun.status).toBe("succeeded");
    expect(factsRun.clause_count).toBe(3);
    expect(factsRun.verified_count).toBe(2);
    const droppedList = factsRun.dropped as Array<{
      clause_id: string;
      clause_type: string;
      reason: string;
      evidence_length: number;
    }>;
    expect(droppedList).toHaveLength(1);
    expect(droppedList[0].clause_id).toBe(clauses[2].id);
    expect(droppedList[0].clause_type).toBe("liability");
    expect(droppedList[0].reason).toBe("not_in_document");
    expect(droppedList[0].evidence_length).toBeGreaterThan(0);

    // Verify GET /api/documents/[id]/findings returns the same findings and facts_summary
    const getFindingsRes = await getFindings(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/findings`, { method: "GET" }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(getFindingsRes.status).toBe(200);
    const getFindingsJson = await getFindingsRes.json();
    expect(getFindingsJson.findings).toHaveLength(analyzeJson.findings.length);
    expect(getFindingsJson.facts_summary).toEqual({
      total_clauses: 3,
      verified_clauses: 2,
    });
  });

  it("second analyze call makes ZERO LLM calls (cached: true)", async () => {
    const { id: docId } = await uploadTestDoc();

    fakeLlm.cannedClauses = [
      {
        clause_type: "payment",
        quote: "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
        page_hint: 2,
        confidence: "high",
      },
    ];

    await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    fakeLlm.cannedFactsItems = [
      {
        clause: "[[C1]]",
        evidence_quote: "within forty-five (45) calendar days from receipt of invoice",
        facts: { days_to_pay: 45, payment_trigger: "invoice_receipt", client_may_withhold: "no" },
      },
    ];

    // First call
    const firstAnalyzeRes = await analyzeDocument(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/analyze`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(firstAnalyzeRes.status).toBe(200);
    const firstJson = await firstAnalyzeRes.json();
    expect(firstJson.run.cached).toBe(false);

    const initialLlmCalls = fakeLlm.callCount;

    // Second call
    const secondAnalyzeRes = await analyzeDocument(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/analyze`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(secondAnalyzeRes.status).toBe(200);
    const secondJson = await secondAnalyzeRes.json();

    expect(secondJson.run.cached).toBe(true);
    expect(fakeLlm.callCount).toBe(initialLlmCalls); // Zero new LLM calls!
  });

  it("changing playbook preferences recomputes findings with ZERO LLM calls", async () => {
    const { id: docId } = await uploadTestDoc();

    fakeLlm.cannedClauses = [
      {
        clause_type: "payment",
        quote: "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
        page_hint: 2,
        confidence: "high",
      },
    ];

    await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    fakeLlm.cannedFactsItems = [
      {
        clause: "[[C1]]",
        evidence_quote: "within forty-five (45) calendar days from receipt of invoice",
        facts: { days_to_pay: 45, payment_trigger: "invoice_receipt", client_may_withhold: "no" },
      },
    ];

    // First analysis: under DEFAULT_PLAYBOOK, max_days_to_pay is 30.
    // 45 days > 30 (not 2x), so PAY-1 fires as medium.
    const firstRes = await analyzeDocument(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/analyze`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );
    const firstJson = await firstRes.json();
    const initialPay1 = firstJson.findings.find((f: FindingRow) => f.rule_id === "PAY-1");
    expect(initialPay1?.severity).toBe("medium");

    const llmCallsBeforePlaybookChange = fakeLlm.callCount;

    // Update playbook: max_days_to_pay = 15.
    // 45 days >= 2 * 15 (45 >= 30), so PAY-1 should now fire as HIGH!
    const putPlaybookReq = new NextRequest(
      `http://localhost:3000/api/documents/${docId}/playbook`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...DEFAULT_PLAYBOOK,
          payment_terms: { max_days_to_pay: 15 },
        }),
      },
    );
    const putRes = await updatePlaybook(putPlaybookReq, { params: Promise.resolve({ id: docId }) });
    expect(putRes.status).toBe(200);

    // Re-run analysis
    const secondRes = await analyzeDocument(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/analyze`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(secondRes.status).toBe(200);
    const secondJson = await secondRes.json();

    expect(secondJson.run.cached).toBe(true);
    expect(fakeLlm.callCount).toBe(llmCallsBeforePlaybookChange); // ZERO LLM calls!

    const updatedPay1 = secondJson.findings.find((f: FindingRow) => f.rule_id === "PAY-1");
    expect(updatedPay1?.severity).toBe("high");
    expect(updatedPay1?.params.playbook_max_days).toBe(15);
  });

  it("returns 409 analysis_in_progress when concurrent analyze requests are fired", async () => {
    const { id: docId } = await uploadTestDoc("concurrent-analyze.pdf");

    fakeLlm.cannedClauses = [
      {
        clause_type: "payment",
        quote: "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
        page_hint: 2,
        confidence: "high",
      },
    ];

    await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    // Delay LLM so first run stays in 'running' state while second request arrives
    fakeLlm.delayMs = 350;
    fakeLlm.cannedFactsItems = [
      {
        clause: "[[C1]]",
        evidence_quote: "within forty-five (45) calendar days from receipt of invoice",
        facts: { days_to_pay: 45, payment_trigger: "invoice_receipt", client_may_withhold: "no" },
      },
    ];

    const firstPromise = analyzeDocument(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/analyze`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    // Wait a brief moment to let first request insert 'running' facts_run
    await new Promise((r) => setTimeout(r, 60));

    const secondPromise = analyzeDocument(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/analyze`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    const [firstRes, secondRes] = await Promise.all([firstPromise, secondPromise]);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(409);
    const secondJson = await secondRes.json();
    expect(secondJson.error?.code).toBe("analysis_in_progress");
  });

  it("marks facts_runs as failed with error code when LLM fails", async () => {
    const { id: docId } = await uploadTestDoc("llm-fail.pdf");
    const admin = createSupabaseAdminClient();

    fakeLlm.cannedClauses = [
      {
        clause_type: "payment",
        quote: "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
        page_hint: 2,
        confidence: "high",
      },
    ];

    await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    fakeLlm.failureError = new LlmError("llm_rate_limited", "AI rate limit reached", 429);

    const res = await analyzeDocument(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/analyze`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error?.code).toBe("llm_rate_limited");

    // Assert facts_runs in DB has status 'failed' with error_code 'llm_rate_limited'
    const { data: run } = await admin
      .from("facts_runs")
      .select("status, error_code")
      .eq("document_id", docId)
      .single();

    expect(run?.status).toBe("failed");
    expect(run?.error_code).toBe("llm_rate_limited");
  });

  it("asserts the anon Supabase client CANNOT read or write findings or facts_runs", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const fakeDocId = crypto.randomUUID();

    // 1. Anon SELECT findings
    const { data: findingsSelectData, error: findingsSelectErr } = await anon
      .from("findings")
      .select("*")
      .eq("document_id", fakeDocId);

    console.info("Anon findings SELECT:", {
      code: findingsSelectErr?.code,
      message: findingsSelectErr?.message,
      dataLength: findingsSelectData?.length,
    });
    // With RLS on and deny-by-default, anon gets either empty array or 42501
    expect(findingsSelectData?.length ?? 0).toBe(0);

    // 2. Anon INSERT findings
    const { error: findingsInsertErr } = await anon.from("findings").insert({
      document_id: fakeDocId,
      extraction_run_id: crypto.randomUUID(),
      rules_version: "v1",
      rule_id: "PAY-1",
      severity: "high",
      priority: 60,
      params: {},
      clause_ids: [],
      evidence: [],
      lawyer_review: false,
      lawyer_review_reasons: [],
    });

    console.info("Anon findings INSERT:", {
      code: findingsInsertErr?.code,
      message: findingsInsertErr?.message,
    });
    expect(findingsInsertErr).toBeTruthy();
    expect(findingsInsertErr?.code).toBe("42501");

    // 3. Anon SELECT facts_runs
    const { data: factsRunsSelectData, error: factsRunsSelectErr } = await anon
      .from("facts_runs")
      .select("*")
      .eq("document_id", fakeDocId);

    console.info("Anon facts_runs SELECT:", {
      code: factsRunsSelectErr?.code,
      message: factsRunsSelectErr?.message,
      dataLength: factsRunsSelectData?.length,
    });
    expect(factsRunsSelectData?.length ?? 0).toBe(0);

    // 4. Anon INSERT facts_runs
    const { error: factsRunsInsertErr } = await anon.from("facts_runs").insert({
      document_id: fakeDocId,
      extraction_run_id: crypto.randomUUID(),
      prompt_version: "v2",
      model: "fake-model",
      status: "running",
      clause_count: 1,
      verified_count: 0,
      dropped: [],
    });

    console.info("Anon facts_runs INSERT:", {
      code: factsRunsInsertErr?.code,
      message: factsRunsInsertErr?.message,
    });
    expect(factsRunsInsertErr).toBeTruthy();
    expect(factsRunsInsertErr?.code).toBe("42501");
  });
});

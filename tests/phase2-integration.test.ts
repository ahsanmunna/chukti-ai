import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getClauses } from "@/app/api/documents/[id]/clauses/route";
import { POST as extractClauses } from "@/app/api/documents/[id]/extract/route";
import { POST as uploadDocument } from "@/app/api/documents/route";
import {
  type GenerateJsonOptions,
  type GenerateJsonResult,
  type LlmClient,
  LlmError,
  setLlmClientForTesting,
} from "@/lib/llm";
import { CONTRACTS_STORAGE_BUCKET } from "@/lib/pdf";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { generateSyntheticFixtures, type GeneratedFixturePaths } from "./generate-fixtures";

function loadLocalEnvIfPresent() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envLocalPath);
  }
}

class FakeLlmClient implements LlmClient {
  public callCount = 0;
  public delayMs = 0;
  public cannedClauses: Array<{
    clause_type: string;
    quote: string;
    page_hint: number;
    confidence: "low" | "medium" | "high";
  }> = [];
  public failureError: Error | null = null;

  async generateJson<T = unknown>(options: GenerateJsonOptions): Promise<GenerateJsonResult<T>> {
    void options;
    this.callCount++;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.failureError) {
      throw this.failureError;
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

describe("Phase 2 API integration (Supabase DB + LLM Extraction + Verifier + Cache + RLS)", () => {
  let fixtures: GeneratedFixturePaths;
  const createdDocs: Array<{ id: string; storagePath: string }> = [];
  const fakeLlm = new FakeLlmClient();

  beforeAll(async () => {
    loadLocalEnvIfPresent();
    fixtures = await generateSyntheticFixtures();
    setLlmClientForTesting(fakeLlm);
  });

  beforeEach(() => {
    setLlmClientForTesting(fakeLlm);
  });

  afterEach(() => {
    fakeLlm.callCount = 0;
    fakeLlm.delayMs = 0;
    fakeLlm.cannedClauses = [];
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
    const filename = customName ?? `fixture-test-${crypto.randomUUID()}.pdf`;
    const uploadReq = buildUploadRequest(rawBytes, filename, "application/pdf");
    const uploadRes = await uploadDocument(uploadReq);
    const uploadJson = await uploadRes.json();
    expect(uploadRes.status).toBe(201);
    createdDocs.push({
      id: uploadJson.document.id,
      storagePath: uploadJson.document.storage_path ?? `${uploadJson.document.id}/${filename}`,
    });
    return { id: uploadJson.document.id, sha256: uploadJson.document.sha256 };
  }

  it("stores accepted clauses with correct page and offsets; rejects fabricated quotes; corrects page_mismatch", async () => {
    const { id: docId } = await uploadTestDoc();
    const admin = createSupabaseAdminClient();
    const uniqueSha = `sha-test-1-${crypto.randomUUID()}`;
    await admin.from("documents").update({ sha256: uniqueSha }).eq("id", docId);

    fakeLlm.cannedClauses = [
      {
        clause_type: "payment",
        quote: "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
        page_hint: 2,
        confidence: "high",
      },
      {
        clause_type: "liability",
        quote: "This is a completely fabricated clause that does not exist anywhere in this document.",
        page_hint: 1,
        confidence: "low",
      },
      {
        clause_type: "liability",
        quote: "Neither party limits financial liability for direct, indirect, or consequential project damages.",
        page_hint: 1, // Wrong hint! It's actually on page 3.
        confidence: "medium",
      },
    ];

    const extractReq = new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, {
      method: "POST",
    });
    const extractRes = await extractClauses(extractReq, {
      params: Promise.resolve({ id: docId }),
    });

    expect(extractRes.status).toBe(200);
    const json = await extractRes.json();

    expect(fakeLlm.callCount).toBe(1);
    expect(json.run).toBeDefined();
    expect(json.run.cached).toBe(false);
    expect(json.run.proposed_count).toBe(3);
    expect(json.run.accepted_count).toBe(2);
    expect(json.run.rejected_count).toBe(1);
    expect(json.clauses).toHaveLength(2);

    // Verify stored clauses in DB
    const { data: dbClauses } = await admin
      .from("clauses")
      .select("*")
      .eq("run_id", json.run.id)
      .order("page_number", { ascending: true });

    expect(dbClauses).toHaveLength(2);

    const paymentClause = dbClauses?.find((c) => c.clause_type === "payment");
    expect(paymentClause).toBeDefined();
    expect(paymentClause?.page_number).toBe(2);
    expect(paymentClause?.char_start).toBeGreaterThanOrEqual(0);
    expect(paymentClause?.char_end).toBeGreaterThan(paymentClause!.char_start!);
    expect(paymentClause?.verbatim_verified).toBe(true);
    expect(paymentClause?.page_mismatch).toBe(false);
    expect(paymentClause?.extraction_confidence).toBe("high");

    const liabilityClause = dbClauses?.find((c) => c.clause_type === "liability");
    expect(liabilityClause).toBeDefined();
    expect(liabilityClause?.page_number).toBe(3);
    expect(liabilityClause?.page_mismatch).toBe(true); // Hint 1 corrected to Page 3
    expect(liabilityClause?.extraction_confidence).toBe("medium");

    // Verify rejected json in extraction_runs
    const { data: runRow } = await admin
      .from("extraction_runs")
      .select("*")
      .eq("id", json.run.id)
      .single();

    expect(runRow?.status).toBe("succeeded");
    expect(runRow?.rejected).toEqual([
      {
        clause_type: "liability",
        reason: "not_found",
        quote_length:
          "This is a completely fabricated clause that does not exist anywhere in this document."
            .length,
      },
    ]);
  });

  it("returns cached:true on a second POST for the same sha256 without calling the LLM", async () => {
    const admin = createSupabaseAdminClient();
    const sharedSha = `shared-sha-${crypto.randomUUID()}`;

    // 1. Upload first doc and set shared sha
    const { id: doc1Id } = await uploadTestDoc();
    await admin.from("documents").update({ sha256: sharedSha }).eq("id", doc1Id);

    fakeLlm.cannedClauses = [
      {
        clause_type: "payment",
        quote: "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
        page_hint: 2,
        confidence: "high",
      },
    ];

    const res1 = await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${doc1Id}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: doc1Id }) },
    );
    expect(res1.status).toBe(200);
    expect(fakeLlm.callCount).toBe(1);

    // 2. Upload a second doc with the same sha
    const { id: doc2Id } = await uploadTestDoc();
    await admin.from("documents").update({ sha256: sharedSha }).eq("id", doc2Id);

    fakeLlm.callCount = 0; // reset counter

    const res2 = await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${doc2Id}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: doc2Id }) },
    );
    expect(res2.status).toBe(200);
    const json2 = await res2.json();

    // Assert cache hit: LLM was NOT called!
    expect(fakeLlm.callCount).toBe(0);
    expect(json2.run.cached).toBe(true);
    expect(json2.run.accepted_count).toBe(1);
    expect(json2.clauses).toHaveLength(1);
    expect(json2.clauses[0].document_id).toBe(doc2Id);
  });

  it("returns 429 rate_limited_local when non-cached runs in the last hour exceed limit", async () => {
    const { id: docId } = await uploadTestDoc();
    const admin = createSupabaseAdminClient();

    // Insert 30 dummy non-cached runs in the last hour to reach EXTRACT_MAX_PER_HOUR (30)
    const runsToInsert = Array.from({ length: 30 }, () => ({
      document_id: docId,
      sha256: `dummy-sha-${crypto.randomUUID()}`,
      prompt_version: "v1",
      model: "gemini-2.5-flash",
      status: "succeeded",
      started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    }));

    const { data: insertedRuns } = await admin
      .from("extraction_runs")
      .insert(runsToInsert)
      .select("id");

    const insertedIds = (insertedRuns ?? []).map((r) => r.id);

    try {
      // Create a document with a unique sha to avoid cache hit
      const uniqueDocRes = await admin
        .from("documents")
        .insert({
          title: "Rate Limit Test",
          file_name: "unique.pdf",
          sha256: `unique-sha-${crypto.randomUUID()}`,
          status: "extracted",
        })
        .select("id")
        .single();

      const uniqueDocId = uniqueDocRes.data!.id;
      createdDocs.push({ id: uniqueDocId, storagePath: "" });

      await admin.from("document_pages").insert({
        document_id: uniqueDocId,
        page_number: 1,
        text: "Some unique text on page one.",
        char_count: 28,
      });

      const res = await extractClauses(
        new NextRequest(`http://localhost:3000/api/documents/${uniqueDocId}/extract`, {
          method: "POST",
        }),
        { params: Promise.resolve({ id: uniqueDocId }) },
      );

      expect(res.status).toBe(429);
      const errJson = await res.json();
      expect(errJson.error.code).toBe("rate_limited_local");
    } finally {
      // Clean up the 30 inserted runs so subsequent tests are not blocked
      if (insertedIds.length > 0) {
        await admin.from("extraction_runs").delete().in("id", insertedIds);
      }
    }
  });

  it("marks the run failed with error_code when the LLM call fails", async () => {
    const { id: docId } = await uploadTestDoc();
    const admin = createSupabaseAdminClient();

    const uniqueSha = `error-sha-${crypto.randomUUID()}`;
    await admin.from("documents").update({ sha256: uniqueSha }).eq("id", docId);

    fakeLlm.failureError = new LlmError("llm_unavailable", "Upstream server 503", 503);

    const res = await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    expect(res.status).toBe(503);
    const errJson = await res.json();
    expect(errJson.error.code).toBe("llm_unavailable");

    // Verify run in DB is marked 'failed'
    const { data: runs } = await admin
      .from("extraction_runs")
      .select("*")
      .eq("document_id", docId)
      .eq("status", "failed")
      .order("started_at", { ascending: false });

    expect(runs).toBeDefined();
    expect(runs!.length).toBeGreaterThan(0);
    expect(runs![0].error_code).toBe("llm_unavailable");
  });

  it("asserts that anon client CANNOT read or write extraction_runs or clauses", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Anon read extraction_runs -> empty
    const { data: readRuns, error: readRunsError } = await anon
      .from("extraction_runs")
      .select("*");
    expect(readRunsError?.code === "42501" || (readRuns && readRuns.length === 0)).toBe(true);

    // Anon insert extraction_runs -> 42501
    const { error: insertRunError } = await anon.from("extraction_runs").insert({
      document_id: crypto.randomUUID(),
      sha256: "test",
      prompt_version: "v1",
      model: "test",
      status: "running",
    });
    expect(insertRunError?.code).toBe("42501");

    // Anon read clauses -> empty
    const { data: readClauses, error: readClausesError } = await anon
      .from("clauses")
      .select("*");
    expect(readClausesError?.code === "42501" || (readClauses && readClauses.length === 0)).toBe(true);

    // Anon insert clauses -> 42501
    const { error: insertClauseError } = await anon.from("clauses").insert({
      document_id: crypto.randomUUID(),
      clause_type: "liability",
      verbatim_text: "test",
      page_number: 1,
    });
    expect(insertClauseError?.code).toBe("42501");
  });

  it("reads clauses of latest succeeded run via GET /api/documents/[id]/clauses ordered by page and char_start", async () => {
    const { id: docId } = await uploadTestDoc();
    const admin = createSupabaseAdminClient();

    const uniqueSha = `get-clauses-sha-${crypto.randomUUID()}`;
    await admin.from("documents").update({ sha256: uniqueSha }).eq("id", docId);

    fakeLlm.cannedClauses = [
      {
        clause_type: "payment",
        quote: "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
        page_hint: 2,
        confidence: "high",
      },
      {
        clause_type: "ip_ownership",
        quote: "All custom source code and project deliverables become Client property upon delivery to repository.",
        page_hint: 2,
        confidence: "medium",
      },
    ];

    const extractRes = await extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(extractRes.status).toBe(200);

    const getRes = await getClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/clauses`, { method: "GET" }),
      { params: Promise.resolve({ id: docId }) },
    );

    expect(getRes.status).toBe(200);
    const json = await getRes.json();
    expect(json.run).toBeDefined();
    expect(json.clauses).toHaveLength(2);
    expect(json.clauses[0].page_number).toBeLessThanOrEqual(json.clauses[1].page_number);
    if (json.clauses[0].page_number === json.clauses[1].page_number) {
      expect(json.clauses[0].char_start).toBeLessThanOrEqual(json.clauses[1].char_start);
    }
  });

  it("returns 409 extraction_in_progress when a concurrent extraction POST is made while a run is running", async () => {
    const { id: docId } = await uploadTestDoc("concurrent-test.pdf");
    const admin = createSupabaseAdminClient();
    const uniqueSha = `concurrent-sha-${crypto.randomUUID()}`;
    await admin.from("documents").update({ sha256: uniqueSha }).eq("id", docId);

    // Controllable delay in LLM client so first run stays in 'running' state
    fakeLlm.delayMs = 300;
    fakeLlm.cannedClauses = [
      {
        clause_type: "liability",
        quote: "aggregate liability under this agreement shall not exceed one (1.0) times fees paid",
        page_hint: 1,
        confidence: "high",
      },
    ];

    const firstReqPromise = extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    // Give first request a short moment to insert 'running' row into DB
    await new Promise((r) => setTimeout(r, 60));

    const secondReqPromise = extractClauses(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/extract`, { method: "POST" }),
      { params: Promise.resolve({ id: docId }) },
    );

    const [firstRes, secondRes] = await Promise.all([firstReqPromise, secondReqPromise]);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(409);
    const secondJson = await secondRes.json();
    expect(secondJson.error?.code).toBe("extraction_in_progress");
  });
});

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getDocumentById } from "@/app/api/documents/[id]/route";
import {
  GET as getPlaybook,
  PUT as putPlaybook,
} from "@/app/api/documents/[id]/playbook/route";
import { POST as uploadDocument } from "@/app/api/documents/route";
import { CONTRACTS_STORAGE_BUCKET } from "@/lib/pdf";
import { DEFAULT_PLAYBOOK } from "@/lib/playbook/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { generateSyntheticFixtures, type GeneratedFixturePaths } from "./generate-fixtures";

function loadLocalEnvIfPresent() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envLocalPath);
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

describe("Phase 1 API integration (Supabase DB + Storage + RLS)", () => {
  let fixtures: GeneratedFixturePaths;
  const createdDocs: Array<{ id: string; storagePath: string }> = [];

  beforeAll(async () => {
    loadLocalEnvIfPresent();
    fixtures = await generateSyntheticFixtures();
  });

  afterAll(async () => {
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
      // Ignore cleanup errors if Supabase env is not configured
    }
  });

  it("uploads fixture-synthetic-text.pdf, stores private file + 3 normalized pages, and reads back", async () => {
    const rawBytes = new Uint8Array(fs.readFileSync(fixtures.textPdf));
    const expectedSha256 = crypto.createHash("sha256").update(rawBytes).digest("hex");

    const uploadReq = buildUploadRequest(
      rawBytes,
      "fixture-synthetic-text.pdf",
      "application/pdf",
    );
    const uploadRes = await uploadDocument(uploadReq);
    const uploadJson = await uploadRes.json();

    expect(uploadRes.status).toBe(201);
    expect(uploadJson.document).toBeDefined();
    expect(uploadJson.document.original_filename).toBe("fixture-synthetic-text.pdf");
    expect(uploadJson.document.sha256).toBe(expectedSha256);
    expect(uploadJson.document.page_count).toBe(3);
    expect(uploadJson.document.status).toBe("extracted");
    expect(uploadJson.document.storage_path).not.toContain("fixture-synthetic-text");

    const docId: string = uploadJson.document.id;
    const storagePath: string = uploadJson.document.storage_path;
    createdDocs.push({ id: docId, storagePath });

    // Read document + per-page text back through GET /api/documents/[id]
    const getRes = await getDocumentById(
      new NextRequest(`http://localhost:3000/api/documents/${docId}`),
      { params: Promise.resolve({ id: docId }) },
    );
    const getJson = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getJson.document.id).toBe(docId);
    expect(getJson.document.page_count).toBe(3);
    expect(getJson.pages).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(getJson.pages[i].page_number).toBe(i + 1);
      expect(getJson.pages[i].text.trim().length).toBeGreaterThan(0);
    }
    expect(getJson.pages[0].text).toContain("SYNTHETIC MASTER SERVICES AGREEMENT");

    // Verify private Storage object exists for admin client and is denied to anon client
    const admin = createSupabaseAdminClient();
    const { data: downloaded, error: downloadError } = await admin.storage
      .from(CONTRACTS_STORAGE_BUCKET)
      .download(storagePath);
    expect(downloadError).toBeNull();
    expect(downloaded).toBeTruthy();

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: anonDocs } = await anon.from("documents").select("id").eq("id", docId);
    expect(anonDocs ?? []).toHaveLength(0);

    const { data: anonPages } = await anon
      .from("document_pages")
      .select("id")
      .eq("document_id", docId);
    expect(anonPages ?? []).toHaveLength(0);

    const { error: anonStorageErr } = await anon.storage
      .from(CONTRACTS_STORAGE_BUCKET)
      .download(storagePath);
    expect(anonStorageErr).toBeTruthy();
  });

  it("saves, reloads, and validates the 5-preference JSONB playbook for an uploaded document", async () => {
    const rawBytes = new Uint8Array(fs.readFileSync(fixtures.textPdf));
    const uploadRes = await uploadDocument(
      buildUploadRequest(rawBytes, "fixture-synthetic-text.pdf", "application/pdf"),
    );
    expect(uploadRes.status).toBe(201);
    const uploaded = await uploadRes.json();
    const docId: string = uploaded.document.id;
    createdDocs.push({ id: docId, storagePath: uploaded.document.storage_path });

    // Initial GET returns starter defaults with saved: false
    const initialGet = await getPlaybook(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/playbook`),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(initialGet.status).toBe(200);
    const initialJson = await initialGet.json();
    expect(initialJson.saved).toBe(false);
    expect(initialJson.playbook).toEqual(DEFAULT_PLAYBOOK);

    // Invalid PUT returns 400 invalid_playbook with field-level messages
    const invalidPut = await putPlaybook(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/playbook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liability_cap: { require_cap: true, max_multiple_of_fees: 25 },
          payment_terms: { max_days_to_pay: 0 },
          ip_ownership: "transfer_after_full_payment",
          termination: { min_notice_days: 14, pay_for_work_done: true },
          scope_changes: { require_written_change_order: true },
        }),
      }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(invalidPut.status).toBe(400);
    const invalidJson = await invalidPut.json();
    expect(invalidJson.error.code).toBe("invalid_playbook");
    expect(invalidJson.error.fields["liability_cap.max_multiple_of_fees"]).toBeTruthy();
    expect(invalidJson.error.fields["payment_terms.max_days_to_pay"]).toBeTruthy();

    // Valid PUT persists custom playbook
    const customPlaybook = {
      liability_cap: { require_cap: true, max_multiple_of_fees: 2.5 },
      payment_terms: { max_days_to_pay: 45 },
      ip_ownership: "license_only" as const,
      termination: { min_notice_days: 30, pay_for_work_done: true },
      scope_changes: { require_written_change_order: true },
    };

    const validPut = await putPlaybook(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/playbook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customPlaybook),
      }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(validPut.status).toBe(200);
    const savedJson = await validPut.json();
    expect(savedJson.saved).toBe(true);
    expect(savedJson.playbook).toEqual(customPlaybook);

    // Reload via GET returns exact same values
    const reloadGet = await getPlaybook(
      new NextRequest(`http://localhost:3000/api/documents/${docId}/playbook`),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(reloadGet.status).toBe(200);
    const reloadJson = await reloadGet.json();
    expect(reloadJson.saved).toBe(true);
    expect(reloadJson.playbook).toEqual(customPlaybook);
  });

  it("rejects no-text, renamed .txt, empty file, invalid UUIDs, and unknown document IDs", async () => {
    const noTextBytes = new Uint8Array(fs.readFileSync(fixtures.noTextPdf));
    const noTextRes = await uploadDocument(
      buildUploadRequest(noTextBytes, "fixture-synthetic-no-text.pdf", "application/pdf"),
    );
    expect(noTextRes.status).toBe(422);
    const noTextJson = await noTextRes.json();
    expect(noTextJson.error.code).toBe("scanned_unsupported");
    expect(noTextJson.error.message.toLowerCase()).toContain(
      "ocr is not supported in this version",
    );

    const txtBytes = new Uint8Array(fs.readFileSync(fixtures.renamedTxtPdf));
    const txtRes = await uploadDocument(
      buildUploadRequest(txtBytes, "fixture-synthetic-renamed-txt.pdf", "application/pdf"),
    );
    expect(txtRes.status).toBe(400);
    expect((await txtRes.json()).error.code).toBe("not_pdf");

    const emptyBytes = new Uint8Array(fs.readFileSync(fixtures.emptyPdf));
    const emptyRes = await uploadDocument(
      buildUploadRequest(emptyBytes, "fixture-synthetic-empty.pdf", "application/pdf"),
    );
    expect(emptyRes.status).toBe(400);
    expect((await emptyRes.json()).error.code).toBe("not_pdf");

    const badIdRes = await getDocumentById(
      new NextRequest("http://localhost:3000/api/documents/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(badIdRes.status).toBe(400);
    expect((await badIdRes.json()).error.code).toBe("invalid_id");

    const missingId = "00000000-0000-4000-8000-000000000000";
    const missingDocRes = await getDocumentById(
      new NextRequest(`http://localhost:3000/api/documents/${missingId}`),
      { params: Promise.resolve({ id: missingId }) },
    );
    expect(missingDocRes.status).toBe(404);
    expect((await missingDocRes.json()).error.code).toBe("not_found");

    const missingPlaybookRes = await putPlaybook(
      new NextRequest(`http://localhost:3000/api/documents/${missingId}/playbook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DEFAULT_PLAYBOOK),
      }),
      { params: Promise.resolve({ id: missingId }) },
    );
    expect(missingPlaybookRes.status).toBe(404);
    expect((await missingPlaybookRes.json()).error.code).toBe("not_found");
  });
});

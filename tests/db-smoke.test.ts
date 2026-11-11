import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DocumentInsert, DocumentRow } from "@/lib/supabase/types";

function loadLocalEnvIfPresent() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envLocalPath);
  }
}

describe("Supabase Step 0 smoke test", () => {
  it("inserts and reads one row in public.documents", async () => {
    loadLocalEnvIfPresent();

    const supabase = createSupabaseAdminClient();
    const payload: DocumentInsert = {
      title: "Step 0 Smoke Test MSA",
      file_name: "step0-smoke-test.pdf",
      mime_type: "application/pdf",
      status: "uploaded",
    };

    let insertedId: string | null = null;

    try {
      const { data: inserted, error: insertError } = await supabase
        .from("documents")
        .insert(payload)
        .select("*")
        .single<DocumentRow>();

      expect(insertError).toBeNull();
      expect(inserted).toBeTruthy();
      expect(inserted?.id).toBeTruthy();
      insertedId = inserted!.id;

      const { data: fetched, error: selectError } = await supabase
        .from("documents")
        .select("*")
        .eq("id", insertedId)
        .single<DocumentRow>();

      expect(selectError).toBeNull();
      expect(fetched).toBeTruthy();
      expect(fetched?.id).toBe(insertedId);
      expect(fetched?.title).toBe(payload.title);
      expect(fetched?.file_name).toBe(payload.file_name);
      expect(fetched?.status).toBe("uploaded");
    } finally {
      if (insertedId) {
        await supabase.from("documents").delete().eq("id", insertedId);
      }
    }
  });
});

import { NextResponse } from "next/server";
import { getEnvStatus } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnvStatus();

  if (
    !env.supabaseUrlConfigured ||
    !env.supabaseAnonKeyConfigured ||
    !env.supabaseServiceRoleConfigured
  ) {
    return NextResponse.json(
      {
        ok: false,
        service: "chukti-ai",
        step: 0,
        database: {
          connected: false,
          error: "Supabase environment variables are not fully configured.",
        },
        env,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("documents").select("id").limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          service: "chukti-ai",
          step: 0,
          database: {
            connected: false,
            error: error.message,
          },
          env,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        service: "chukti-ai",
        step: 0,
        database: {
          connected: true,
        },
        env,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    return NextResponse.json(
      {
        ok: false,
        service: "chukti-ai",
        step: 0,
        database: {
          connected: false,
          error: message,
        },
        env,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

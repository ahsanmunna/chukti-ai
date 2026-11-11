import { describe, expect, it, afterEach, vi } from "vitest";
import { getEnvStatus, getServerEnv } from "@/lib/env";

describe("env handling", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports non-secret boolean configuration status without exposing values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubEnv("GEMINI_API_KEY", "");

    const status = getEnvStatus();
    expect(status).toEqual({
      supabaseUrlConfigured: true,
      supabaseAnonKeyConfigured: true,
      supabaseServiceRoleConfigured: true,
      llmKeyConfigured: false,
    });
    expect(JSON.stringify(status)).not.toContain("test-service-role-key");
  });

  it("rejects missing required Supabase server env variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(() => getServerEnv()).toThrow();
  });
});

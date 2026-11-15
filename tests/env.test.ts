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

  it("defaults LLM_MODEL to gemini-3.6-flash and LLM_FALLBACK_MODEL to undefined", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    delete process.env.LLM_MODEL;
    delete process.env.LLM_FALLBACK_MODEL;

    const env = getServerEnv();
    expect(env.LLM_MODEL).toBe("gemini-3.6-flash");
    expect(env.LLM_FALLBACK_MODEL).toBeUndefined();
  });

  it("parses configured LLM_FALLBACK_MODEL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubEnv("LLM_MODEL", "gemini-3.6-flash");
    vi.stubEnv("LLM_FALLBACK_MODEL", "gemini-2.5-flash");

    const env = getServerEnv();
    expect(env.LLM_MODEL).toBe("gemini-3.6-flash");
    expect(env.LLM_FALLBACK_MODEL).toBe("gemini-2.5-flash");
  });
});

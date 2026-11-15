import { afterEach, describe, expect, it, vi } from "vitest";
import { runLlmCheck, runModelCheck, sanitizeMessage } from "@/scripts/llm-check";

describe("scripts/llm-check unit tests", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sanitizes error messages and truncates to 300 characters without leaking API key", () => {
    const apiKey = "secret-gemini-key-12345";
    const longMessage = `Error with key ${apiKey}: ${"x".repeat(400)}`;

    const sanitized = sanitizeMessage(longMessage, apiKey);
    expect(sanitized).not.toContain(apiKey);
    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized.length).toBeLessThanOrEqual(300);
  });

  it("sends correct plain request format and parses success", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = JSON.parse(init?.body as string);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "OK" }] } }],
        }),
      };
    });

    const result = await runModelCheck(
      "gemini-3.6-flash",
      "plain",
      "my-test-key",
      mockFetch as unknown as typeof fetch,
    );

    expect(result.passed).toBe(true);
    expect(result.status).toBe(200);
    expect(capturedUrl).toContain("models/gemini-3.6-flash:generateContent");
    expect(capturedHeaders["x-goog-api-key"]).toBe("my-test-key");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
    expect(capturedBody.contents[0].parts[0].text).toBe("Reply with the single word OK");
    expect(capturedBody.generationConfig).toBeUndefined();
  });

  it("sends correct structured request format with responseSchema", async () => {
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"ok":"OK"}' }] } }],
        }),
      };
    });

    const result = await runModelCheck(
      "gemini-3.6-flash",
      "structured",
      "my-test-key",
      mockFetch as unknown as typeof fetch,
    );

    expect(result.passed).toBe(true);
    expect(capturedBody.generationConfig.responseMimeType).toBe("application/json");
    expect(capturedBody.generationConfig.responseSchema).toEqual({
      type: "OBJECT",
      properties: {
        ok: {
          type: "STRING",
        },
      },
      required: ["ok"],
    });
  });

  it("handles error response and extracts Google error message up to 300 chars", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: "API key invalid: secret-key-xyz",
          status: "INVALID_ARGUMENT",
        },
      }),
    });

    const result = await runModelCheck(
      "gemini-3.6-flash",
      "plain",
      "secret-key-xyz",
      mockFetch as unknown as typeof fetch,
    );

    expect(result.passed).toBe(false);
    expect(result.status).toBe(400);
    expect(result.errorMessage).toBe("API key invalid: [REDACTED]");
    expect(result.errorMessage).not.toContain("secret-key-xyz");
  });

  it("runLlmCheck returns false (exit code 1) when primary model fails either request", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-api-key");
    vi.stubEnv("LLM_MODEL", "gemini-3.6-flash");
    vi.stubEnv("LLM_FALLBACK_MODEL", "gemini-2.5-flash");

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Primary plain fails with 503, primary structured succeeds, fallback passes
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      if (url.includes("gemini-3.6-flash") && !body.generationConfig) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { message: "Primary 503" } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }),
      };
    });

    const success = await runLlmCheck(mockFetch as unknown as typeof fetch);
    expect(success).toBe(false); // Should trigger exit code 1

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("FAIL [gemini-3.6-flash] (plain) Status: 503"),
    );
  });

  it("runLlmCheck returns true (exit code 0) when primary passes even if fallback fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-api-key");
    vi.stubEnv("LLM_MODEL", "gemini-3.6-flash");
    vi.stubEnv("LLM_FALLBACK_MODEL", "gemini-2.5-flash");

    vi.spyOn(console, "log").mockImplementation(() => {});

    // Primary passes, fallback fails
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("gemini-2.5-flash")) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: "Model not found" } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }),
      };
    });

    const success = await runLlmCheck(mockFetch as unknown as typeof fetch);
    expect(success).toBe(true); // Exit code 1 ONLY if primary fails
  });

  it("runLlmCheck returns false when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const success = await runLlmCheck();

    expect(success).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("GEMINI_API_KEY is not configured"),
    );
  });
});

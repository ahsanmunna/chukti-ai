import { describe, expect, it, vi } from "vitest";
import { GeminiLlmClient } from "@/lib/llm/gemini";

describe("B. LLM wrapper: GeminiLlmClient with mocked fetch", () => {
  const dummySchema = {
    type: "OBJECT",
    properties: {
      result: { type: "STRING" },
    },
  };

  it("successfully parses valid JSON response on first attempt", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ result: "extracted_data" }) }],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 150,
          candidatesTokenCount: 45,
        },
        modelVersion: "gemini-2.5-flash",
      }),
    });

    const client = new GeminiLlmClient({
      apiKey: "test-api-key",
      model: "gemini-2.5-flash",
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 5000,
      initialBackoffMs: 1,
    });

    const res = await client.generateJson<{ result: string }>({
      system: "system prompt",
      user: "user prompt",
      jsonSchema: dummySchema,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.json).toEqual({ result: "extracted_data" });
    expect(res.usage).toEqual({ inputTokens: 150, outputTokens: 45 });
    expect(res.model).toBe("gemini-2.5-flash");
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "0" }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ result: "success_after_retry" }) }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      };
    });

    const client = new GeminiLlmClient({
      apiKey: "test-api-key",
      fetchFn: mockFetch as unknown as typeof fetch,
      initialBackoffMs: 1,
      maxRetries: 2,
    });

    const res = await client.generateJson<{ result: string }>({
      system: "system",
      user: "user",
      jsonSchema: dummySchema,
    });

    expect(callCount).toBe(2);
    expect(res.json).toEqual({ result: "success_after_retry" });
  });

  it("retries 429 three times (maxRetries=2) then fails with llm_rate_limited", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
    });

    const client = new GeminiLlmClient({
      apiKey: "test-api-key",
      fetchFn: mockFetch as unknown as typeof fetch,
      initialBackoffMs: 1,
      maxRetries: 2,
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_rate_limited",
        status: 429,
      }),
    );

    // Initial attempt + 2 retries = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries invalid JSON once and fails with llm_invalid_output if still invalid", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "THIS IS NOT VALID JSON" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    });

    const client = new GeminiLlmClient({
      apiKey: "test-api-key",
      fetchFn: mockFetch as unknown as typeof fetch,
      initialBackoffMs: 1,
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_invalid_output",
        status: 502,
      }),
    );

    // Retried once on bad JSON = 2 attempts
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles timeout with AbortError and throws llm_unavailable after retries", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      const err = new Error("Request timed out");
      err.name = "AbortError";
      throw err;
    });

    const client = new GeminiLlmClient({
      apiKey: "test-api-key",
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 10,
      initialBackoffMs: 1,
      maxRetries: 1,
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_unavailable",
        status: 504,
      }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws llm_not_configured when API key is missing or empty", async () => {
    const client = new GeminiLlmClient({
      apiKey: "",
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_not_configured",
        status: 503,
      }),
    );
  });

  it("throws llm_blocked when safety filters block the response or candidates are empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        promptFeedback: {
          blockReason: "SAFETY",
        },
        candidates: [],
      }),
    });

    const client = new GeminiLlmClient({
      apiKey: "test-api-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_blocked",
        status: 422,
      }),
    );
  });

  it("throws llm_bad_request on 400 response with no retry and logs safely", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretKey = "super-secret-api-key";
    const userPrompt = "sensitive user prompt";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: "Invalid argument: field X is invalid",
          status: "INVALID_ARGUMENT",
        },
      }),
    });

    const client = new GeminiLlmClient({
      apiKey: secretKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
    });

    await expect(
      client.generateJson({
        system: "system prompt",
        user: userPrompt,
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_bad_request",
      }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = consoleErrorSpy.mock.calls[0][0];
    expect(logged).toContain("status=400");
    expect(logged).toContain("google_status=INVALID_ARGUMENT");
    expect(logged).toContain("message=Invalid argument: field X is invalid");
    expect(logged).not.toContain(secretKey);
    expect(logged).not.toContain(userPrompt);

    consoleErrorSpy.mockRestore();
  });

  it("throws llm_bad_request on 404 response with no retry and logs safely", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          code: 404,
          message: "Model not found",
          status: "NOT_FOUND",
        },
      }),
    });

    const client = new GeminiLlmClient({
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_bad_request",
      }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain("status=404");
    consoleErrorSpy.mockRestore();
  });

  it("stops retrying when elapsed + next delay would exceed overallDeadlineMs and throws last error code", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 503,
        json: async () => ({
          error: { message: "Service unavailable", status: "UNAVAILABLE" },
        }),
      };
    });

    const client = new GeminiLlmClient({
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
      initialBackoffMs: 50,
      overallDeadlineMs: 40,
      maxRetries: 2,
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_unavailable",
      }),
    );

    expect(callCount).toBe(1);
  });

  it("reads response body inside the timeout window and times out if body read hangs", async () => {
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        json: () =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      };
    });

    const client = new GeminiLlmClient({
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 30,
      initialBackoffMs: 1,
      maxRetries: 0,
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_unavailable",
        status: 504,
      }),
    );
  });

  it("joins all text parts that are not thoughts from candidates", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "I am thinking about the schema..." },
                { text: '{"res' },
                { thought: true, text: "more thinking..." },
                { text: 'ult":"joined_success"}' },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    });

    const client = new GeminiLlmClient({
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await client.generateJson<{ result: string }>({
      system: "system",
      user: "user",
      jsonSchema: dummySchema,
    });

    expect(res.json).toEqual({ result: "joined_success" });
  });

  it("throws llm_invalid_output when finishReason is MAX_TOKENS", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '{"result":"trunc' }],
            },
            finishReason: "MAX_TOKENS",
          },
        ],
      }),
    });

    const client = new GeminiLlmClient({
      apiKey: "test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateJson({
        system: "system",
        user: "user",
        jsonSchema: dummySchema,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "llm_invalid_output",
        status: 502,
      }),
    );
  });

  describe("Fallback model and 5xx backoff (M2 & M3)", () => {
    it("primary 503 x3 then fallback OK -> result carries the fallback model name", async () => {
      let primaryCalls = 0;
      let fallbackCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("gemini-primary")) {
          primaryCalls++;
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            json: async () => ({
              error: { message: "Primary model overloaded", status: "UNAVAILABLE" },
            }),
          };
        }
        if (url.includes("gemini-fallback")) {
          fallbackCalls++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [{ text: JSON.stringify({ result: "fallback_ok" }) }],
                  },
                  finishReason: "STOP",
                },
              ],
            }),
          };
        }
        throw new Error(`Unexpected URL called: ${url}`);
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        model: "gemini-primary",
        fallbackModel: "gemini-fallback",
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 1,
        maxRetries: 2, // 1 initial + 2 retries = 3 calls of 503
      });

      const res = await client.generateJson<{ result: string }>({
        system: "sys",
        user: "usr",
        jsonSchema: dummySchema,
      });

      expect(primaryCalls).toBe(3);
      expect(fallbackCalls).toBe(1);
      expect(res.json).toEqual({ result: "fallback_ok" });
      expect(res.model).toBe("gemini-fallback");
    });

    it("primary 400 -> no fallback", async () => {
      let primaryCalls = 0;
      let fallbackCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("gemini-primary")) {
          primaryCalls++;
          return {
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({
              error: { message: "Bad request payload", status: "INVALID_ARGUMENT" },
            }),
          };
        }
        if (url.includes("gemini-fallback")) {
          fallbackCalls++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [{ text: JSON.stringify({ result: "should_never_reach" }) }],
                  },
                },
              ],
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        model: "gemini-primary",
        fallbackModel: "gemini-fallback",
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 1,
        maxRetries: 2,
      });

      await expect(
        client.generateJson({
          system: "sys",
          user: "usr",
          jsonSchema: dummySchema,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "llm_bad_request",
        }),
      );

      expect(primaryCalls).toBe(1);
      expect(fallbackCalls).toBe(0);
    });

    it("no fallback configured -> original error", async () => {
      let primaryCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("gemini-primary")) {
          primaryCalls++;
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            json: async () => ({
              error: { message: "Primary unavailable", status: "UNAVAILABLE" },
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        model: "gemini-primary",
        // fallbackModel omitted
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 1,
        maxRetries: 2,
      });

      await expect(
        client.generateJson({
          system: "sys",
          user: "usr",
          jsonSchema: dummySchema,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "llm_unavailable",
          status: 503,
        }),
      );

      // 1 initial + 2 retries = 3 calls on primary
      expect(primaryCalls).toBe(3);
    });

    it("both fail -> last error code", async () => {
      let primaryCalls = 0;
      let fallbackCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("gemini-primary")) {
          primaryCalls++;
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            json: async () => ({
              error: { message: "Primary 503", status: "UNAVAILABLE" },
            }),
          };
        }
        if (url.includes("gemini-fallback")) {
          fallbackCalls++;
          return {
            ok: false,
            status: 429,
            headers: new Headers(),
            json: async () => ({
              error: { message: "Fallback 429", status: "RESOURCE_EXHAUSTED" },
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        model: "gemini-primary",
        fallbackModel: "gemini-fallback",
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 1,
        maxRetries: 1,
      });

      await expect(
        client.generateJson({
          system: "sys",
          user: "usr",
          jsonSchema: dummySchema,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "llm_rate_limited",
          status: 429,
        }),
      );

      expect(primaryCalls).toBe(2); // 1 initial + 1 retry
      expect(fallbackCalls).toBe(2); // 1 initial + 1 retry
    });

    it("does not fall back when fallback model is identical to primary model", async () => {
      let calls = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        calls++;
        return {
          ok: false,
          status: 503,
          headers: new Headers(),
          json: async () => ({ error: { message: "503", status: "UNAVAILABLE" } }),
        };
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        model: "gemini-same",
        fallbackModel: "gemini-same",
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 1,
        maxRetries: 1,
      });

      await expect(
        client.generateJson({
          system: "sys",
          user: "usr",
          jsonSchema: dummySchema,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "llm_unavailable",
        }),
      );

      expect(calls).toBe(2);
    });

    it("does not fall back on llm_blocked or llm_invalid_output", async () => {
      let calls = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        calls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            promptFeedback: { blockReason: "SAFETY" },
            candidates: [],
          }),
        };
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        model: "gemini-primary",
        fallbackModel: "gemini-fallback",
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 1,
        maxRetries: 1,
      });

      await expect(
        client.generateJson({
          system: "sys",
          user: "usr",
          jsonSchema: dummySchema,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "llm_blocked",
        }),
      );

      expect(calls).toBe(1);
    });

    it("retries 5xx responses with default maxRetries=3 (4 calls total) before failing with llm_unavailable", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({
            error: { message: "Internal server error", status: "INTERNAL" },
          }),
        };
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 1, // tiny delay for unit test
        // maxRetries defaults to 3
      });

      await expect(
        client.generateJson({
          system: "sys",
          user: "usr",
          jsonSchema: dummySchema,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "llm_unavailable",
          status: 500,
        }),
      );

      // Initial attempt + 3 retries = 4 calls
      expect(callCount).toBe(4);
    });

    it("enforces overall deadline across primary plus fallback together", async () => {
      let primaryCalls = 0;
      let fallbackCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("primary-model")) {
          primaryCalls++;
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            json: async () => ({ error: { message: "503", status: "UNAVAILABLE" } }),
          };
        }
        if (url.includes("fallback-model")) {
          fallbackCalls++;
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            json: async () => ({ error: { message: "503", status: "UNAVAILABLE" } }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        model: "primary-model",
        fallbackModel: "fallback-model",
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 50,
        overallDeadlineMs: 40, // Deadline smaller than backoff
        maxRetries: 3,
      });

      await expect(
        client.generateJson({
          system: "sys",
          user: "usr",
          jsonSchema: dummySchema,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "llm_unavailable",
        }),
      );

      expect(primaryCalls).toBe(1);
      expect(fallbackCalls).toBe(1);
    });

    it("gives fallback model its own fresh deadline budget even if primary consumed elapsed time", async () => {
      let primaryCalls = 0;
      let fallbackCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("primary-model")) {
          primaryCalls++;
          // Simulate latency in primary model
          await new Promise((r) => setTimeout(r, 60));
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            json: async () => ({ error: { message: "503", status: "UNAVAILABLE" } }),
          };
        }
        if (url.includes("fallback-model")) {
          fallbackCalls++;
          // Fallback takes 60ms; with a shared 100ms deadline from overall start,
          // 60ms + 60ms = 120ms > 100ms would fail. With separate budget, fallback elapsed is 60ms <= 100ms.
          await new Promise((r) => setTimeout(r, 60));
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [{ text: JSON.stringify({ result: "fallback_with_own_budget" }) }],
                  },
                  finishReason: "STOP",
                },
              ],
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const client = new GeminiLlmClient({
        apiKey: "test-api-key",
        model: "primary-model",
        fallbackModel: "fallback-model",
        fetchFn: mockFetch as unknown as typeof fetch,
        initialBackoffMs: 100,
        overallDeadlineMs: 100, // Budget is 100ms per model
        maxRetries: 0,
      });

      const res = await client.generateJson<{ result: string }>({
        system: "sys",
        user: "usr",
        jsonSchema: dummySchema,
      });

      expect(primaryCalls).toBe(1);
      expect(fallbackCalls).toBe(1);
      expect(res.json).toEqual({ result: "fallback_with_own_budget" });
      expect(res.model).toBe("fallback-model");
    });
  });
});

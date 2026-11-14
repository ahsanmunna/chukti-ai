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
});

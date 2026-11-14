import {
  type GenerateJsonOptions,
  type GenerateJsonResult,
  type LlmClient,
  LlmError,
} from "./types";

export interface GeminiClientOptions {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  initialBackoffMs?: number;
  maxRetries?: number;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
    role?: string;
  };
  finishReason?: string;
}

interface GeminiApiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const diff = date - Date.now();
    return diff > 0 ? diff : null;
  }
  return null;
}

export class GeminiLlmClient implements LlmClient {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxRetries: number;

  constructor(options?: GeminiClientOptions) {
    this.apiKey = options?.apiKey;
    this.model = options?.model || "gemini-2.5-flash";
    this.fetchFn = options?.fetchFn || globalThis.fetch;
    this.timeoutMs = options?.timeoutMs ?? 90_000;
    this.initialBackoffMs = options?.initialBackoffMs ?? 1_000;
    this.maxRetries = options?.maxRetries ?? 2;
  }

  async generateJson<T = unknown>(options: GenerateJsonOptions): Promise<GenerateJsonResult<T>> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new LlmError("llm_not_configured", "Gemini API key is not configured.", 503);
    }

    // Try up to 2 attempts for invalid JSON / output parsing
    let parseAttempts = 0;
    while (parseAttempts < 2) {
      parseAttempts++;
      const { text, usage, model } = await this.executeWithNetworkRetries(options);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        if (parseAttempts < 2) {
          // Retry once on bad JSON
          continue;
        }
        throw new LlmError("llm_invalid_output", "LLM output is not valid JSON.", 502);
      }

      return {
        json: parsed as T,
        usage,
        model,
      };
    }

    throw new LlmError("llm_invalid_output", "LLM output could not be parsed as valid JSON.", 502);
  }

  private async executeWithNetworkRetries(
    options: GenerateJsonOptions,
  ): Promise<{ text: string; usage: { inputTokens?: number; outputTokens?: number }; model: string }> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model,
    )}:generateContent`;

    const requestBody = {
      systemInstruction: {
        parts: [{ text: options.system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: options.user }],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: options.jsonSchema,
        ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
      },
    };

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey!,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = (await response.json()) as GeminiApiResponse;

          if (data.promptFeedback?.blockReason) {
            throw new LlmError(
              "llm_blocked",
              `Prompt blocked by safety filters: ${data.promptFeedback.blockReason}`,
              422,
            );
          }

          if (!data.candidates || data.candidates.length === 0) {
            throw new LlmError("llm_blocked", "LLM returned no candidates.", 422);
          }

          const candidate = data.candidates[0];
          const finishReason = candidate.finishReason;
          if (
            finishReason === "SAFETY" ||
            finishReason === "BLOCK" ||
            finishReason === "RECITATION"
          ) {
            throw new LlmError(
              "llm_blocked",
              `Candidate blocked: finish reason ${finishReason}`,
              422,
            );
          }

          const rawText = candidate.content?.parts?.[0]?.text;
          if (typeof rawText !== "string" || rawText.trim().length === 0) {
            throw new LlmError("llm_blocked", "LLM candidate text is empty.", 422);
          }

          return {
            text: rawText,
            usage: {
              inputTokens: data.usageMetadata?.promptTokenCount,
              outputTokens: data.usageMetadata?.candidatesTokenCount,
            },
            model: data.modelVersion || this.model,
          };
        }

        // Handle error responses
        const status = response.status;
        if (status === 429) {
          if (attempt <= this.maxRetries) {
            const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
            const delay = retryAfterMs ?? this.initialBackoffMs * Math.pow(2, attempt - 1);
            await sleep(delay);
            continue;
          }
          throw new LlmError("llm_rate_limited", "Gemini API rate limit exceeded (429).", 429);
        }

        if (status >= 500 && status < 600) {
          if (attempt <= this.maxRetries) {
            const delay = this.initialBackoffMs * Math.pow(2, attempt - 1);
            await sleep(delay);
            continue;
          }
          throw new LlmError(
            "llm_unavailable",
            `Gemini API unavailable (${status}).`,
            status,
          );
        }

        // Other 4xx errors: no retry
        if (status === 401 || status === 403) {
          throw new LlmError("llm_not_configured", `Gemini API auth error (${status}).`, status);
        }

        throw new LlmError(
          "llm_unavailable",
          `Gemini API returned error status ${status}.`,
          status,
        );
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof LlmError) {
          throw err;
        }

        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || err.name === "TimeoutError");

        if (attempt <= this.maxRetries) {
          const delay = this.initialBackoffMs * Math.pow(2, attempt - 1);
          await sleep(delay);
          continue;
        }

        throw new LlmError(
          "llm_unavailable",
          isAbort ? "Gemini API request timed out." : "Gemini API network request failed.",
          isAbort ? 504 : 503,
        );
      }
    }

    throw new LlmError("llm_unavailable", "Gemini API request failed after retries.", 503);
  }
}

import {
  type GenerateJsonOptions,
  type GenerateJsonResult,
  type LlmClient,
  LlmError,
} from "./types";

export interface GeminiClientOptions {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  initialBackoffMs?: number;
  maxRetries?: number;
  overallDeadlineMs?: number;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
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
  private readonly fallbackModel?: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxRetries: number;
  private readonly overallDeadlineMs: number;

  constructor(options?: GeminiClientOptions) {
    this.apiKey = options?.apiKey;
    this.model = options?.model || "gemini-3.6-flash";
    this.fallbackModel = options?.fallbackModel;
    this.fetchFn = options?.fetchFn || globalThis.fetch;
    this.timeoutMs = options?.timeoutMs ?? 90_000;
    this.initialBackoffMs = options?.initialBackoffMs ?? 2_000;
    this.maxRetries = options?.maxRetries ?? 3;
    this.overallDeadlineMs = options?.overallDeadlineMs ?? 150_000;
  }

  async generateJson<T = unknown>(options: GenerateJsonOptions): Promise<GenerateJsonResult<T>> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new LlmError("llm_not_configured", "Gemini API key is not configured.", 503);
    }

    const overallStart = Date.now();

    try {
      return await this.executeModelAttemptSet<T>(this.model, options, overallStart);
    } catch (primaryErr) {
      const shouldFallback =
        Boolean(this.fallbackModel) &&
        this.fallbackModel !== this.model &&
        primaryErr instanceof LlmError &&
        (primaryErr.code === "llm_unavailable" || primaryErr.code === "llm_rate_limited");

      if (!shouldFallback) {
        throw primaryErr;
      }

      return await this.executeModelAttemptSet<T>(this.fallbackModel!, options, overallStart);
    }
  }

  private async executeModelAttemptSet<T>(
    targetModel: string,
    options: GenerateJsonOptions,
    overallStart: number,
  ): Promise<GenerateJsonResult<T>> {
    let parseAttempts = 0;
    while (parseAttempts < 2) {
      parseAttempts++;
      const { text, usage, model } = await this.executeWithNetworkRetries(
        targetModel,
        options,
        overallStart,
      );

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        const elapsed = Date.now() - overallStart;
        if (parseAttempts < 2 && elapsed <= this.overallDeadlineMs) {
          // Retry once on bad JSON if within overall deadline
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
    targetModel: string,
    options: GenerateJsonOptions,
    overallStart: number,
  ): Promise<{ text: string; usage: { inputTokens?: number; outputTokens?: number }; model: string }> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      targetModel,
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

        if (response.ok) {
          // Read response body inside timeout window
          const data = (await response.json()) as GeminiApiResponse;
          clearTimeout(timeoutId);

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

          if (finishReason === "MAX_TOKENS") {
            throw new LlmError(
              "llm_invalid_output",
              "LLM output truncated (MAX_TOKENS reached).",
              502,
            );
          }

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

          const parts = candidate.content?.parts ?? [];
          const textParts = parts
            .filter((p) => p.thought !== true && typeof p.text === "string")
            .map((p) => p.text as string);
          const rawText = textParts.join("");

          if (rawText.trim().length === 0) {
            throw new LlmError("llm_blocked", "LLM candidate text is empty.", 422);
          }

          return {
            text: rawText,
            usage: {
              inputTokens: data.usageMetadata?.promptTokenCount,
              outputTokens: data.usageMetadata?.candidatesTokenCount,
            },
            model: targetModel,
          };
        }

        // Handle error responses: read error body inside timeout window safely
        let googleStatus = "unknown";
        let errorMessage = "unknown";
        try {
          const errBody = (await response.json()) as {
            error?: { status?: unknown; message?: unknown };
          };
          if (errBody?.error?.status !== undefined && errBody?.error?.status !== null) {
            googleStatus = String(errBody.error.status);
          }
          if (errBody?.error?.message !== undefined && errBody?.error?.message !== null) {
            errorMessage = String(errBody.error.message).slice(0, 300);
          }
        } catch {
          // Body parsing may fail if response is not valid JSON
        }

        clearTimeout(timeoutId);

        console.error(
          `[llm] gemini_error status=${response.status} google_status=${googleStatus} message=${errorMessage}`,
        );

        const status = response.status;
        if (status === 429) {
          const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
          const delay = retryAfterMs ?? this.initialBackoffMs * Math.pow(2, attempt - 1);
          const elapsed = Date.now() - overallStart;
          if (attempt <= this.maxRetries && elapsed + delay <= this.overallDeadlineMs) {
            await sleep(delay);
            continue;
          }
          throw new LlmError("llm_rate_limited", "Gemini API rate limit exceeded (429).", 429);
        }

        if (status >= 500 && status < 600) {
          const delay = this.initialBackoffMs * Math.pow(2, attempt - 1);
          const elapsed = Date.now() - overallStart;
          if (attempt <= this.maxRetries && elapsed + delay <= this.overallDeadlineMs) {
            await sleep(delay);
            continue;
          }
          throw new LlmError(
            "llm_unavailable",
            `Gemini API unavailable (${status}).`,
            status,
          );
        }

        // 401 and 403: auth errors
        if (status === 401 || status === 403) {
          throw new LlmError("llm_not_configured", `Gemini API auth error (${status}).`, status);
        }

        // Any other 4xx (e.g. 400, 404): NOT retried
        if (status >= 400 && status < 500) {
          throw new LlmError("llm_bad_request", `Gemini API client error (${status}).`, status);
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

        const delay = this.initialBackoffMs * Math.pow(2, attempt - 1);
        const elapsed = Date.now() - overallStart;
        if (attempt <= this.maxRetries && elapsed + delay <= this.overallDeadlineMs) {
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

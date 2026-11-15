/**
 * Diagnostic check for configured Gemini LLM models.
 * Invoked via: npm run llm:check
 * (node --env-file=.env.local scripts/llm-check.ts)
 *
 * HARD RULES:
 * 1. Must never print the API key or any request body.
 * 2. Exit code 1 if the PRIMARY model fails either request.
 * 3. Print PASS or FAIL per request with model name, HTTP status, and Google's error message (<= 300 chars).
 */

interface GeminiErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface CheckResult {
  passed: boolean;
  model: string;
  type: "plain" | "structured";
  status: number;
  errorMessage?: string;
}

export function sanitizeMessage(raw: string, apiKey?: string): string {
  let text = raw;
  if (apiKey && apiKey.trim().length > 0) {
    text = text.replaceAll(apiKey.trim(), "[REDACTED]");
  }
  return text.slice(0, 300);
}

export async function runModelCheck(
  model: string,
  type: "plain" | "structured",
  apiKey: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<CheckResult> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const requestBody =
    type === "plain"
      ? {
          contents: [
            {
              role: "user",
              parts: [{ text: "Reply with the single word OK" }],
            },
          ],
        }
      : {
          contents: [
            {
              role: "user",
              parts: [{ text: "Reply with the single word OK" }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                ok: {
                  type: "STRING",
                },
              },
              required: ["ok"],
            },
          },
        };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey.trim(),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        passed: true,
        model,
        type,
        status: response.status,
      };
    }

    let googleMessage = response.statusText || "Request failed";
    try {
      const data = (await response.json()) as GeminiErrorResponse;
      if (data?.error?.message) {
        googleMessage = data.error.message;
      }
    } catch {
      // Ignore JSON parsing errors for error body
    }

    return {
      passed: false,
      model,
      type,
      status: response.status,
      errorMessage: sanitizeMessage(googleMessage, apiKey),
    };
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err);
    return {
      passed: false,
      model,
      type,
      status: 0,
      errorMessage: sanitizeMessage(rawError, apiKey),
    };
  }
}

export async function runLlmCheck(fetchFn: typeof fetch = globalThis.fetch): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const primaryModel = process.env.LLM_MODEL?.trim() || "gemini-3.6-flash";
  const fallbackModel = process.env.LLM_FALLBACK_MODEL?.trim();

  if (!apiKey || apiKey.length === 0) {
    console.error(`FAIL [${primaryModel}] (plain) Status: 503 - GEMINI_API_KEY is not configured`);
    console.error(`FAIL [${primaryModel}] (structured) Status: 503 - GEMINI_API_KEY is not configured`);
    return false;
  }

  const targets: Array<{ role: "primary" | "fallback"; model: string }> = [
    { role: "primary", model: primaryModel },
  ];

  if (fallbackModel && fallbackModel.length > 0) {
    targets.push({ role: "fallback", model: fallbackModel });
  }

  let primaryFailed = false;

  for (const target of targets) {
    // 1. Plain request
    const plainResult = await runModelCheck(target.model, "plain", apiKey, fetchFn);
    if (plainResult.passed) {
      console.log(`PASS [${plainResult.model}] (plain) Status: ${plainResult.status}`);
    } else {
      console.log(
        `FAIL [${plainResult.model}] (plain) Status: ${plainResult.status} - ${plainResult.errorMessage ?? "Error"}`,
      );
      if (target.role === "primary") {
        primaryFailed = true;
      }
    }

    // 2. Structured request
    const structuredResult = await runModelCheck(target.model, "structured", apiKey, fetchFn);
    if (structuredResult.passed) {
      console.log(`PASS [${structuredResult.model}] (structured) Status: ${structuredResult.status}`);
    } else {
      console.log(
        `FAIL [${structuredResult.model}] (structured) Status: ${structuredResult.status} - ${structuredResult.errorMessage ?? "Error"}`,
      );
      if (target.role === "primary") {
        primaryFailed = true;
      }
    }
  }

  return !primaryFailed;
}

// Run directly when invoked from node CLI
const isDirectCli = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/llm-check.ts");
if (isDirectCli) {
  void runLlmCheck().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

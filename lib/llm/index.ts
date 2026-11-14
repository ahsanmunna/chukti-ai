import { getServerEnv } from "@/lib/env";
import { GeminiLlmClient } from "./gemini";
import type { LlmClient } from "./types";

export * from "./types";
export * from "./gemini";

let injectedLlmClient: LlmClient | null = null;

/**
 * Injects a fake or mock LlmClient for tests.
 * Pass null to restore default env-based client.
 */
export function setLlmClientForTesting(client: LlmClient | null): void {
  injectedLlmClient = client;
}

/**
 * Returns the active LlmClient.
 * Reads GEMINI_API_KEY and LLM_MODEL from getServerEnv() unless an injected client is active.
 */
export function getLlmClient(): LlmClient {
  if (injectedLlmClient) {
    return injectedLlmClient;
  }

  const env = getServerEnv();
  return new GeminiLlmClient({
    apiKey: env.GEMINI_API_KEY,
    model: env.LLM_MODEL,
  });
}

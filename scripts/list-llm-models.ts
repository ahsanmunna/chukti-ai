/**
 * Lists available Gemini models that support generateContent.
 * Invoked via: npm run llm:models
 * (node --env-file=.env.local scripts/list-llm-models.ts)
 *
 * HARD RULE: Never log or print the API key.
 */

interface GeminiModelItem {
  name: string;
  baseModelId?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

interface ListModelsResponse {
  models?: GeminiModelItem[];
  nextPageToken?: string;
}

async function listModels(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    console.error("Error: GEMINI_API_KEY is not configured in .env.local or environment.");
    process.exit(1);
  }

  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey.trim(),
      },
    });

    if (!response.ok) {
      console.error(
        `Error: Failed to fetch models from Gemini API. Status: ${response.status} ${response.statusText}`,
      );
      process.exit(1);
    }

    const data = (await response.json()) as ListModelsResponse;
    const allModels = data.models ?? [];

    const contentModels = allModels.filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent"),
    );

    if (contentModels.length === 0) {
      console.log("No models supporting generateContent found.");
      return;
    }

    console.log(`Found ${contentModels.length} Gemini models supporting generateContent:\n`);
    for (const m of contentModels) {
      const modelId = m.name.replace(/^models\//, "");
      const inputLimit = m.inputTokenLimit !== undefined
        ? m.inputTokenLimit.toLocaleString()
        : "N/A";
      const outputLimit = m.outputTokenLimit !== undefined
        ? m.outputTokenLimit.toLocaleString()
        : "N/A";

      console.log(
        `- ${modelId.padEnd(28)} | Input limit: ${inputLimit.padStart(10)} tokens | Output limit: ${outputLimit.padStart(8)} tokens`,
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Network or API error while listing models: ${errorMsg}`);
    process.exit(1);
  }
}

void listModels();

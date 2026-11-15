export type LlmErrorCode =
  | "llm_not_configured"
  | "llm_rate_limited"
  | "llm_unavailable"
  | "llm_invalid_output"
  | "llm_blocked"
  | "llm_bad_request";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly status?: number;

  constructor(code: LlmErrorCode, message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.status = status;
  }
}

export interface GenerateJsonOptions {
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
}

export interface GenerateJsonResult<T = unknown> {
  json: T;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
  };
  model: string;
}

export interface LlmClient {
  generateJson<T = unknown>(options: GenerateJsonOptions): Promise<GenerateJsonResult<T>>;
}

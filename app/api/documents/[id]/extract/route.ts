import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isValidUuid, jsonError } from "@/lib/api/responses";
import {
  ExtractionServiceError,
  extractDocumentClauses,
} from "@/lib/extraction/service";
import { LlmError } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return jsonError(400, "invalid_id", "Document ID must be a valid UUID.");
  }

  try {
    const result = await extractDocumentClauses(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ExtractionServiceError) {
      return jsonError(error.httpStatus, error.code, error.message);
    }
    if (error instanceof LlmError) {
      const statusMap: Record<string, number> = {
        llm_not_configured: 503,
        llm_rate_limited: 429,
        llm_unavailable: 503,
        llm_invalid_output: 502,
        llm_blocked: 422,
        llm_bad_request: 502,
      };
      const status = statusMap[error.code] ?? 500;
      return jsonError(status, error.code, error.message);
    }

    console.error(`[extract] unexpected_error id=${id}`);
    return jsonError(500, "internal_error", "An unexpected error occurred during extraction.");
  }
}

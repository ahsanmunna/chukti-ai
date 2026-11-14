import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isValidUuid, jsonError } from "@/lib/api/responses";
import {
  ExtractionServiceError,
  getDocumentClauses,
} from "@/lib/extraction/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return jsonError(400, "invalid_id", "Document ID must be a valid UUID.");
  }

  try {
    const result = await getDocumentClauses(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ExtractionServiceError) {
      return jsonError(error.httpStatus, error.code, error.message);
    }
    console.error(`[clauses] unexpected_error id=${id}`);
    return jsonError(500, "internal_error", "An unexpected error occurred while loading clauses.");
  }
}

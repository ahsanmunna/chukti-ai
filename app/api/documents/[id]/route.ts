import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isValidUuid, jsonError } from "@/lib/api/responses";
import { DocumentServiceError, getDocumentWithPages } from "@/lib/documents/service";

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
    const result = await getDocumentWithPages(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DocumentServiceError) {
      return jsonError(error.httpStatus, error.code, error.message, error.fields);
    }
    console.error(`[documents] unexpected_get_error id=${id}`);
    return jsonError(500, "internal_error", "Unexpected error while loading document.");
  }
}

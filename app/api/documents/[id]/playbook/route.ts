import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isValidUuid, jsonError } from "@/lib/api/responses";
import {
  DocumentServiceError,
  getDocumentPlaybook,
  saveDocumentPlaybook,
} from "@/lib/documents/service";

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
    const result = await getDocumentPlaybook(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DocumentServiceError) {
      return jsonError(error.httpStatus, error.code, error.message, error.fields);
    }
    console.error(`[playbook] unexpected_get_error id=${id}`);
    return jsonError(500, "internal_error", "Unexpected error while loading playbook.");
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return jsonError(400, "invalid_id", "Document ID must be a valid UUID.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      400,
      "invalid_playbook",
      "Request body must be valid JSON.",
      { playbook: "Request body must be valid JSON." },
    );
  }

  try {
    const result = await saveDocumentPlaybook(id, body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DocumentServiceError) {
      return jsonError(error.httpStatus, error.code, error.message, error.fields);
    }
    console.error(`[playbook] unexpected_put_error id=${id}`);
    return jsonError(500, "internal_error", "Unexpected error while saving playbook.");
  }
}

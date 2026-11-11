import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { DocumentServiceError, ingestUploadedPdf } from "@/lib/documents/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(
      400,
      "invalid_request",
      "Request must be multipart/form-data containing a 'file' field.",
    );
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return jsonError(
      400,
      "missing_file",
      "A PDF file in the 'file' form field is required.",
    );
  }

  const bytes = new Uint8Array(await fileEntry.arrayBuffer());

  try {
    const result = await ingestUploadedPdf({
      bytes,
      mimeType: fileEntry.type,
      rawFilename: fileEntry.name,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentServiceError) {
      return jsonError(error.httpStatus, error.code, error.message, error.fields);
    }
    console.error("[documents] unexpected_upload_error");
    return jsonError(500, "internal_error", "Unexpected error while processing PDF upload.");
  }
}

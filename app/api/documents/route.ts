import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { DocumentServiceError, ingestUploadedPdf } from "@/lib/documents/service";
import { MAX_PDF_BYTES } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Reject oversized uploads before buffering multipart data if Content-Length is provided.
  // Content-Length can be missing or wrong; extract.ts remains the final authority.
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_PDF_BYTES + 1024 * 1024) {
      return jsonError(413, "too_large", "Upload exceeds the 10 MB size limit.");
    }
  }

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

  // Reject oversized uploads before reading the full buffer into memory.
  if (typeof fileEntry.size === "number" && fileEntry.size > MAX_PDF_BYTES) {
    return jsonError(413, "too_large", "Upload exceeds the 10 MB size limit.");
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

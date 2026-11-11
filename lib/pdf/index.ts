import { NotImplementedError } from "@/lib/errors";

/**
 * Step 1: Extract per-page text from text-based contract PDFs.
 */
export async function extractPdfPages(): Promise<never> {
  throw new NotImplementedError("Step 1 (PDF extraction)");
}

import type { PlaybookPreferences } from "@/lib/playbook/schema";

export interface DocumentMetadataDto {
  id: string;
  original_filename: string;
  sha256: string;
  page_count: number;
  status: string;
  storage_path: string;
  created_at: string;
}

export interface DocumentPageDto {
  page_number: number;
  text: string;
}

export interface DocumentWithPagesDto {
  document: DocumentMetadataDto;
  pages: DocumentPageDto[];
}

export interface PlaybookResponseDto {
  document_id: string;
  saved: boolean;
  playbook: PlaybookPreferences;
  updated_at: string | null;
}

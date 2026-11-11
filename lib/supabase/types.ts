import type { PlaybookPreferences } from "@/lib/playbook/schema";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DocumentStatus =
  | "uploaded"
  | "extracted"
  | "unsupported_scanned"
  | "analyzed"
  | "error";

export type ClauseType =
  | "liability"
  | "payment"
  | "indemnity"
  | "ip"
  | "termination"
  | "governing_law"
  | "scope"
  | "other";

export type RiskSeverity = "low" | "medium" | "high" | "critical";
export type UserDecision = "pending" | "approved" | "rejected" | "edited";

export interface DocumentRow {
  id: string;
  user_id: string | null;
  title: string;
  file_name: string;
  original_filename: string | null;
  sha256: string | null;
  storage_path: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  page_count: number | null;
  pages: Json | null;
  extracted_text: string | null;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentInsert {
  id?: string;
  user_id?: string | null;
  title?: string;
  file_name?: string;
  original_filename?: string | null;
  sha256?: string | null;
  storage_path?: string | null;
  mime_type?: string;
  file_size_bytes?: number | null;
  page_count?: number | null;
  pages?: Json | null;
  extracted_text?: string | null;
  status?: DocumentStatus;
  error_message?: string | null;
}

export interface DocumentPageRow {
  id: string;
  document_id: string;
  page_number: number;
  text: string;
  char_count: number;
  created_at: string;
}

export interface PlaybookRow {
  id: string;
  document_id: string;
  preferences: PlaybookPreferences;
  liability_cap_preference: string | null;
  payment_terms_max_days: number | null;
  ip_ownership_preference: string | null;
  termination_preference: string | null;
  scope_changes_preference: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClauseRow {
  id: string;
  document_id: string;
  clause_type: ClauseType;
  verbatim_text: string;
  page_number: number;
  char_start: number | null;
  char_end: number | null;
  verbatim_verified: boolean;
  confidence: number | null;
  lawyer_review_required: boolean;
  raw_llm_output: Json | null;
  created_at: string;
}

export interface RiskRow {
  id: string;
  document_id: string;
  clause_id: string | null;
  rule_violated: string;
  severity: RiskSeverity;
  /** Prioritization ranking (0-100), never a legal probability. */
  priority_score: number;
  is_foreign_law_or_arbitration: boolean;
  financial_consequence: string | null;
  confidence: number | null;
  lawyer_review_required: boolean;
  explanation_en: string | null;
  explanation_bn: string | null;
  statute_context: string | null;
  statute_section_number: string | null;
  /** Statute section numbers remain hidden in UI unless verified by a lawyer. */
  statute_lawyer_verified: boolean;
  counter_clause: string | null;
  client_message: string | null;
  user_decision: UserDecision;
  approved_counter_clause: string | null;
  created_at: string;
  updated_at: string;
}

export interface InteractionRuleRow {
  id: string;
  rule_code: string;
  name: string;
  description: string;
  source_clause_type: string;
  target_clause_type: string;
  condition_spec: Json;
  severity: RiskSeverity;
  financial_consequence_template: string | null;
  statute_section_number: string | null;
  statute_lawyer_verified: boolean;
  is_active: boolean;
  created_at: string;
}

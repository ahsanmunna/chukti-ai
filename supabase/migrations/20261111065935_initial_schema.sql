-- Chukti AI — Step 0 Initial Schema
-- Tables: documents, playbooks, clauses, risks, interaction_rules

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. documents: uploaded MSA/SOW contract PDFs and extracted per-page text
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  file_name text not null,
  storage_path text,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  page_count integer check (page_count is null or page_count >= 0),
  pages jsonb,
  extracted_text text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracted', 'unsupported_scanned', 'analyzed', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create index if not exists idx_documents_user_id on public.documents(user_id);
create index if not exists idx_documents_created_at on public.documents(created_at desc);

-- 2. playbooks: 5-preference user playbook saved per document (Step 2)
create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  liability_cap_preference text not null,
  payment_terms_max_days integer not null check (payment_terms_max_days > 0 and payment_terms_max_days <= 365),
  ip_ownership_preference text not null,
  termination_preference text not null,
  scope_changes_preference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_playbooks_updated_at
before update on public.playbooks
for each row execute function public.set_updated_at();

-- 3. clauses: extracted verbatim clauses with page reference and grounding status (Step 3)
create table if not exists public.clauses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  clause_type text not null
    check (clause_type in ('liability', 'payment', 'indemnity', 'ip', 'termination', 'governing_law', 'scope', 'other')),
  verbatim_text text not null,
  page_number integer not null check (page_number >= 1),
  char_start integer check (char_start is null or char_start >= 0),
  char_end integer check (char_end is null or char_end >= 0),
  verbatim_verified boolean not null default false,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  lawyer_review_required boolean not null default false,
  raw_llm_output jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_clauses_document_id on public.clauses(document_id);
create index if not exists idx_clauses_type on public.clauses(document_id, clause_type);

-- 4. risks: deterministic rule + LLM findings, prioritization score, counter-clause, approval
create table if not exists public.risks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  clause_id uuid references public.clauses(id) on delete set null,
  rule_violated text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  priority_score integer not null default 0 check (priority_score >= 0 and priority_score <= 100),
  is_foreign_law_or_arbitration boolean not null default false,
  financial_consequence text,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  lawyer_review_required boolean not null default false,
  explanation_en text,
  explanation_bn text,
  statute_context text,
  statute_section_number text,
  statute_lawyer_verified boolean not null default false,
  counter_clause text,
  client_message text,
  user_decision text not null default 'pending'
    check (user_decision in ('pending', 'approved', 'rejected', 'edited')),
  approved_counter_clause text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.risks.priority_score is
  'Prioritization ranking (0-100), NOT a legal probability.';
comment on column public.risks.statute_lawyer_verified is
  'Must remain false until a lawyer verifies statute_section_number; UI must hide unverified section numbers.';

create trigger trg_risks_updated_at
before update on public.risks
for each row execute function public.set_updated_at();

create index if not exists idx_risks_document_id on public.risks(document_id);
create index if not exists idx_risks_clause_id on public.risks(clause_id);

-- 5. interaction_rules: curated clause-interaction dependency rules loaded from DB (Step 5)
create table if not exists public.interaction_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null unique,
  name text not null,
  description text not null,
  source_clause_type text not null,
  target_clause_type text not null,
  condition_spec jsonb not null default '{}'::jsonb,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  financial_consequence_template text,
  statute_section_number text,
  statute_lawyer_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on column public.interaction_rules.statute_lawyer_verified is
  'Must remain false until a lawyer verifies statute_section_number; UI must hide unverified section numbers.';

create index if not exists idx_interaction_rules_active on public.interaction_rules(is_active) where is_active = true;

-- Row-Level Security (service_role bypasses RLS for server-side routes/tests)
alter table public.documents enable row level security;
alter table public.playbooks enable row level security;
alter table public.clauses enable row level security;
alter table public.risks enable row level security;
alter table public.interaction_rules enable row level security;

create policy "Users manage own documents"
on public.documents
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage playbooks for own documents"
on public.playbooks
for all
to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = playbooks.document_id and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.documents d
    where d.id = playbooks.document_id and d.user_id = auth.uid()
  )
);

create policy "Users manage clauses for own documents"
on public.clauses
for all
to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = clauses.document_id and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.documents d
    where d.id = clauses.document_id and d.user_id = auth.uid()
  )
);

create policy "Users manage risks for own documents"
on public.risks
for all
to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = risks.document_id and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.documents d
    where d.id = risks.document_id and d.user_id = auth.uid()
  )
);

create policy "Authenticated users read active interaction rules"
on public.interaction_rules
for select
to authenticated
using (is_active = true);

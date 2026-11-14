-- Chukti AI — Phase 2: Clause extraction with grounded quotes
-- Tables: extraction_runs, evolved clauses with run_id, page_mismatch, extraction_confidence, and 8 Phase 2 clause types

-- 1. Create public.extraction_runs table
create table if not exists public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  sha256 text not null,
  prompt_version text not null,
  model text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  proposed_count integer not null default 0 check (proposed_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected jsonb not null default '[]'::jsonb,
  cached_from_run_id uuid references public.extraction_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_extraction_runs_document_id on public.extraction_runs(document_id);
create index if not exists idx_extraction_runs_cache on public.extraction_runs(sha256, prompt_version, model, status);
create index if not exists idx_extraction_runs_started_at on public.extraction_runs(started_at desc);

-- 2. Evolve public.clauses table
alter table public.clauses
  add column if not exists run_id uuid references public.extraction_runs(id) on delete cascade,
  add column if not exists page_mismatch boolean not null default false,
  add column if not exists extraction_confidence text
    check (extraction_confidence is null or extraction_confidence in ('low', 'medium', 'high'));

-- Reconcile clause_type check constraint for Phase 2 8-clause vocabulary
alter table public.clauses
  drop constraint if exists clauses_clause_type_check;

alter table public.clauses
  add constraint clauses_clause_type_check
  check (clause_type in (
    'liability',
    'payment',
    'indemnity',
    'ip_ownership',
    'termination',
    'scope_change',
    'governing_law',
    'definition'
  ));

create index if not exists idx_clauses_run_id on public.clauses(run_id);

-- 3. Row-Level Security: Deny-by-default on extraction_runs (no client policies; server uses service_role)
alter table public.extraction_runs enable row level security;
alter table public.clauses enable row level security;

-- Chukti AI — Phase 3: Facts extraction, deterministic risk rule engine, and findings
-- Tables: facts_runs, evolved clauses with facts columns, findings, and drop public.risks

-- 1. Evolve public.clauses table with facts columns
alter table public.clauses
  add column if not exists facts jsonb,
  add column if not exists facts_evidence text,
  add column if not exists facts_verified boolean not null default false,
  add column if not exists facts_prompt_version text;

-- 2. Create public.facts_runs table
create table if not exists public.facts_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  extraction_run_id uuid not null references public.extraction_runs(id) on delete cascade,
  prompt_version text not null,
  model text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  clause_count integer not null default 0 check (clause_count >= 0),
  verified_count integer not null default 0 check (verified_count >= 0),
  dropped jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_facts_runs_document_id on public.facts_runs(document_id);
create index if not exists idx_facts_runs_started_at on public.facts_runs(started_at desc);

create unique index if not exists idx_facts_runs_running_unique
  on public.facts_runs(document_id)
  where status = 'running';

-- Row-Level Security: Deny-by-default on facts_runs (no client policies; server uses service_role)
alter table public.facts_runs enable row level security;

-- 3. Drop old public.risks table (verified 0 rows and no code references)
drop table if exists public.risks;

-- 4. Create public.findings table
create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  extraction_run_id uuid not null references public.extraction_runs(id) on delete cascade,
  facts_run_id uuid references public.facts_runs(id) on delete set null,
  rules_version text not null,
  rule_id text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  priority integer not null check (priority >= 0 and priority <= 100),
  params jsonb not null default '{}'::jsonb,
  clause_ids uuid[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  lawyer_review boolean not null default false,
  lawyer_review_reasons jsonb not null default '[]'::jsonb,
  playbook_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_findings_document_id on public.findings(document_id);
create index if not exists idx_findings_document_priority on public.findings(document_id, priority desc);

-- Row-Level Security: Deny-by-default on findings (no client policies; server uses service_role)
alter table public.findings enable row level security;

-- 5. Atomic replacement helper function for document findings
create or replace function public.replace_document_findings(
  p_document_id uuid,
  p_findings jsonb
)
returns setof public.findings
language plpgsql
security definer
as $$
begin
  delete from public.findings where document_id = p_document_id;

  if jsonb_array_length(p_findings) > 0 then
    return query
    insert into public.findings (
      document_id,
      extraction_run_id,
      facts_run_id,
      rules_version,
      rule_id,
      severity,
      priority,
      params,
      clause_ids,
      evidence,
      lawyer_review,
      lawyer_review_reasons,
      playbook_snapshot
    )
    select
      (elem->>'document_id')::uuid,
      (elem->>'extraction_run_id')::uuid,
      nullif(elem->>'facts_run_id', '')::uuid,
      elem->>'rules_version',
      elem->>'rule_id',
      elem->>'severity',
      (elem->>'priority')::integer,
      coalesce(elem->'params', '{}'::jsonb),
      array(select jsonb_array_elements_text(coalesce(elem->'clause_ids', '[]'::jsonb)))::uuid[],
      coalesce(elem->'evidence', '[]'::jsonb),
      coalesce((elem->>'lawyer_review')::boolean, false),
      coalesce(elem->'lawyer_review_reasons', '[]'::jsonb),
      coalesce(elem->'playbook_snapshot', '{}'::jsonb)
    from jsonb_array_elements(p_findings) as elem
    returning *;
  end if;

  return;
end;
$$;

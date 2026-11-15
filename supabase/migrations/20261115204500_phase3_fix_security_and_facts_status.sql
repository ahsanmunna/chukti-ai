-- Chukti AI — Phase 3 Fix Round 2: Security hardening for replace_document_findings and facts_status schema

-- S1: Security hardening for public.replace_document_findings
revoke all on function public.replace_document_findings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_document_findings(uuid, jsonb) to service_role;
alter function public.replace_document_findings(uuid, jsonb) set search_path = public, pg_temp;

-- C1: Facts status: empty is not failure
alter table public.clauses
  add column if not exists facts_status text check (facts_status in ('extracted', 'none', 'failed'));

-- Backfill facts_status on existing clauses if any
update public.clauses
set facts_status = case
  when facts_verified = true then 'extracted'
  when facts is not null then 'failed'
  else null
end
where facts_status is null;

alter table public.facts_runs
  add column if not exists no_facts_count integer not null default 0,
  add column if not exists failed_count integer not null default 0;

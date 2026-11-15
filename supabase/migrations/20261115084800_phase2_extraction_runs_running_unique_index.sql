-- Chukti AI — Phase 2: Prevent concurrent extraction runs on same document
-- Partial unique index on extraction_runs(document_id) WHERE status = 'running'

-- Mark any existing stale running runs as failed before creating index
update public.extraction_runs
set status = 'failed', error_code = 'stale', finished_at = now()
where status = 'running' and started_at < now() - interval '3 minutes';

create unique index if not exists idx_extraction_runs_running_unique
  on public.extraction_runs(document_id)
  where status = 'running';

-- Chukti AI — Phase 1: Document upload, per-page normalized text, JSONB playbook, private storage, deny-by-default RLS

-- 1. Evolve public.documents for Phase 1 metadata requirements
alter table public.documents
  add column if not exists original_filename text,
  add column if not exists sha256 text;

alter table public.documents
  alter column title set default '',
  alter column file_name set default '';

update public.documents
set original_filename = file_name
where original_filename is null;

create index if not exists idx_documents_sha256 on public.documents(sha256);

-- 2. Create public.document_pages for per-page normalized extracted text (single source of truth)
create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  text text not null,
  char_count integer not null check (char_count >= 0),
  created_at timestamptz not null default now(),
  unique (document_id, page_number)
);

create index if not exists idx_document_pages_document_page
  on public.document_pages(document_id, page_number);

-- 3. Evolve public.playbooks to store the 5-preference schema as JSONB (one row per document)
alter table public.playbooks
  add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.playbooks
  alter column liability_cap_preference drop not null,
  alter column payment_terms_max_days drop not null,
  alter column ip_ownership_preference drop not null,
  alter column termination_preference drop not null,
  alter column scope_changes_preference drop not null;

-- 4. Enable RLS on every table and remove client-facing policies (deny by default; server uses service_role)
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.playbooks enable row level security;
alter table public.clauses enable row level security;
alter table public.risks enable row level security;
alter table public.interaction_rules enable row level security;

drop policy if exists "Users manage own documents" on public.documents;
drop policy if exists "Users manage playbooks for own documents" on public.playbooks;
drop policy if exists "Users manage clauses for own documents" on public.clauses;
drop policy if exists "Users manage risks for own documents" on public.risks;
drop policy if exists "Authenticated users read active interaction rules" on public.interaction_rules;

-- 5. Private Supabase Storage bucket "contracts" (10 MiB limit, PDF only, no public policies)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contracts',
  'contracts',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

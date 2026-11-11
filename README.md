# Chukti AI

Contract protection copilot for Bangladeshi freelance developers and small agencies signing international Master Services Agreements (MSA) and Statements of Work (SOW).

> **Disclaimer:** Chukti AI does **not** provide legal advice. Always have qualified legal counsel review important contract terms, low-confidence findings, and foreign governing-law risks before signing.

## Current Status: Step 0 (Skeleton)

- Next.js (TypeScript) application shell and `/api/health` route
- Environment variable validation (`/lib/env.ts`)
- Supabase database schema migration (`/supabase/migrations/*_initial_schema.sql`) for:
  - `documents`
  - `playbooks`
  - `clauses`
  - `risks`
  - `interaction_rules`
- Module boundaries under `/lib/{pdf,clauses,risk,interactions,llm,verify,export}` (explicitly returning `NotImplementedError` until later steps)
- Unit and Supabase database smoke tests under `/tests`

## Prerequisites

- Node.js 20+ (tested on Node 24) and npm
- For local Supabase development: Docker Desktop + Supabase CLI (`npx supabase`)
- Or a hosted Supabase project

## Setup & Run Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy `.env.example` to `.env.local` and fill in your Supabase keys (never commit `.env.local`):
```bash
cp .env.example .env.local
```

### 3a. Local Supabase (Docker)
Start Docker Desktop, then start local Supabase and apply migrations:
```bash
npx supabase start
npx supabase status
```
Copy the printed `API URL`, `anon key`, and `service_role key` into `.env.local` as:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

To reset or re-apply local migrations cleanly:
```bash
npx supabase db reset
```

### 3b. Hosted Supabase (Alternative)
Link your Supabase project and push the migration:
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```
Then put your project's URL, anon key, and service role key into `.env.local`.

### 4. Start the development server
```bash
npm run dev
```
Visit `http://localhost:3000` and `http://localhost:3000/api/health`.

### 5. Run typecheck, lint, and tests
```bash
npm run typecheck
npm run lint
npm test
```

## Deploy Notes
Designed for Vercel (Next.js) + Supabase (Postgres, `pgvector`, Storage, Auth). Configure the variables from `.env.example` in your hosting environment.

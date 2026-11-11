# Chukti AI — Architecture (Step 0 Skeleton)

## Overview
Chukti AI is a contract protection copilot for Bangladeshi freelance developers and small agencies reviewing international Master Services Agreements (MSA) and Statements of Work (SOW).

## Stack
- **Frontend & API**: Next.js (App Router, TypeScript)
- **Database, Storage & Auth**: Supabase (Postgres + `pgvector` extension, Storage, Auth)
- **LLM**: Single configured provider (Step 3+), strictly schema-validated via Zod

## Repository Layout
- `/app` — Next.js routes, layout (`Not legal advice` banner), and `/api/health`
- `/lib/pdf` — Per-page text extraction for text-based PDFs (Step 1)
- `/lib/clauses` — Clause segmentation, extraction, and Zod schemas (Step 3)
- `/lib/risk` — Deterministic playbook rules engine (Step 2 / Step 4)
- `/lib/interactions` — Curated clause-interaction rules loaded from `interaction_rules` (Step 5)
- `/lib/llm` — LLM API wrapper, prompts, Zod validation, and single-retry handling (Step 3+)
- `/lib/verify` — Deterministic verbatim quote grounding verifier (Step 3+)
- `/lib/export` — Obligations JSON and side-by-side DOCX table export (Step 8–9)
- `/supabase/migrations` — Postgres SQL migrations (`documents`, `playbooks`, `clauses`, `risks`, `interaction_rules`)
- `/tests` — Unit and integration tests plus public contract fixtures
- `/docs` — Architecture, AI usage log, and data/privacy documentation

## Data Model & Hard-Rule Guardrails
- `risks.priority_score` (0–100) is strictly a **prioritization ranking**, never a legal probability.
- `risks.statute_section_number` and `interaction_rules.statute_section_number` carry `statute_lawyer_verified` (`false` by default). Unverified section numbers must not be displayed; Bangladesh Contract Act 1872 serves only as baseline context unless lawyer-verified.
- Foreign governing law or arbitration clauses are modeled explicitly (`is_foreign_law_or_arbitration`) as their own financial risk.
- Low-confidence items carry `lawyer_review_required` flags.
- DOCX export produces a side-by-side comparison table (original vs proposed), not tracked changes.

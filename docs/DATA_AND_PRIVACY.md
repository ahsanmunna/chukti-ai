# Data & Privacy Notes (Draft — Unverified)

> **Status**: Pending project-owner verification. No privacy assurances or retention/training claims should be surfaced in user-facing copy until verified against deployed Supabase and LLM API configurations.

## Technical Data Flow (Step 0)
- Environment secrets are stored only in untracked `.env.local` (for local development) or deployment environment variables (e.g., Vercel / Supabase). `.env.example` contains placeholders only.
- Uploaded contract metadata and analysis records are designed to live in Supabase Postgres tables (`documents`, `playbooks`, `clauses`, `risks`, `interaction_rules`) with Row-Level Security enabled.
- No third-party LLM API calls are active in Step 0.

# Chukti AI

**A Bangla/English contract-protection copilot for Bangladeshi freelance developers.**
Built by **Team Mythic Order** for the International AI Builders Congress 2026 ("Idea to Unicorn").

> **Not legal advice.** Chukti AI helps organize contract text and review preferences. Have a qualified lawyer review important terms before signing. This is a prototype.

---

## The problem

Bangladeshi freelancers often sign contracts written by foreign clients: in English, under foreign law, with no lawyer to read them. One clause that delays payment, transfers your code before you are paid, or lets the client walk away can cost real money. Freelancers elsewhere face the same problem. Most simply sign.

## What Chukti AI does

1. You set a **5-preference playbook**: payment time, intellectual property, liability, termination, scope changes.
2. You upload a contract PDF (text-based, single column).
3. Chukti AI reads the clauses and checks them against **your** playbook.
4. You get findings sorted by severity (Critical / High / Medium), each with:
   - the **exact quote** from the contract, highlighted in the document
   - why it matters and what to ask for
   - **suggested replacement wording** and a ready-to-send **message to the client**
   - a **"needs lawyer review"** flag on risky items (for example foreign governing law)
5. The interface switches between **English and Bangla** with one click.

Chukti AI also catches **combined risks** that single-clause checks miss, for example: IP transfers on creation *and* payment is due 60 days after acceptance.

## How the AI works ("AI reads, rules decide")

```
PDF text
  -> Gemini extracts clauses (LLM)
  -> every quoted clause is verified word-for-word against the document (unmatched quotes are dropped)
  -> Gemini extracts structured facts per clause (LLM; cached per document and prompt version)
  -> deterministic rule engine compares the facts with your playbook
  -> findings, wording and client message
```

- **The model never decides the risk.** It only reads text and labels facts. Fixed, tested rules produce the findings, so the same facts always give the same result.
- **Rules (version v5):** PAY-1, PAY-2, PAY-3, LIAB-1, IP-1, TERM-1, TERM-2, SCOPE-1, LAW-1, IND-1, DEF-1, ACC-1, plus combined rules COMBO-1 (critical) and COMBO-2 (high). See [`docs/RULES.md`](docs/RULES.md).
- **Safeguards in code:** keyword backstops for termination clauses, foreign law derived in code, quote verification.
- **Not RAG.** The approach is LLM extraction plus a deterministic rule engine.
- Suggested wording and client messages are **deterministic templates** (English only), not free-form model output. They are starter drafts, not lawyer-reviewed.

## Data and privacy

- Analyzing sends the **contract text to Google's Gemini API**. We use the **free tier, where Google may use submitted content to improve its products**. **Do not analyze confidential contracts.** The app shows this notice before analysis.
- All development and testing used **synthetic contracts** (in `tests/contracts/`). No real client contract was used.
- Documents and results are stored in a local Supabase (Postgres) database with row-level security (deny by default); the service key is server-side only.

## Evaluation

7 synthetic contracts with known answers, one run each, `gemini-3.6-flash`:

| Contract | Expected risks found |
|---|---|
| Risky sample MSA (used in development) | 12 of 13 (missed DEF-1) |
| Balanced sample (used in development) | 1 of 1 |
| eval-3 IP + payment | 4 of 4 |
| eval-4 termination | 2 of 2 |
| eval-5 foreign law + scope | 2 of 2 |
| eval-6 looks risky but fine | 0 of 0 (correctly no findings) |
| eval-7 acceptance + indemnity | 4 of 4 |

**Total: 25 of 26 expected risks found, 0 false alarms.** The five contracts not used during development scored 12 of 12. This is a small test, results can vary between runs, and it is not a claim of general accuracy.

## Run it locally

Requirements: Node.js 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli), and a free [Gemini API key](https://aistudio.google.com/).

```bash
git clone <this repo>
cd chukti-ai
npm install

supabase start            # starts local Postgres; migrations in supabase/migrations are applied
supabase status           # shows the local API URL, anon key and service_role key

cp .env.example .env.local   # on Windows PowerShell: Copy-Item .env.example .env.local
# edit .env.local: paste the local anon and service_role keys from `supabase status`
# and your own GEMINI_API_KEY. Never commit .env.local.

npm run dev               # http://localhost:3000
```

Then upload one of the PDFs in `tests/contracts/`.

Useful commands: `npm test` (unit tests), `npm run typecheck`, `npm run build`.

### Configuration

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` | `gemini` |
| `LLM_MODEL` | primary model, we used `gemini-3.6-flash` |
| `LLM_FALLBACK_MODEL` | optional second model if the first is overloaded |
| `GEMINI_API_KEY` | your own key, server-side only |
| `EXTRACT_MAX_PER_HOUR` | simple rate limit |

Free-tier Gemini has small daily limits. If the service reports it is busy, wait and retry.

## Tech stack

Next.js 16 (Turbopack), React 19, Tailwind, zod, Vitest, Supabase (local Postgres with RLS), Google Gemini REST API.

## Known limitations

- Text-based, single-column PDFs only (no scanned/OCR documents yet).
- Findings and drafts are in English; the interface and finding explanations switch to Bangla, but drafts are not translated yet.
- Five playbook preferences only; defaults are starter defaults, not lawyer-reviewed.
- Depends on Gemini availability and free-tier limits; model output can vary between runs.
- Small evaluation on synthetic contracts.

## Ethical safeguards

- Explicit "not legal advice" notice and "needs lawyer review" flags on high-stakes items.
- Every finding is backed by a quote verified word-for-word in the document.
- The model never sets severity; rules do. Severity is a prioritization aid, never a legal probability.
- Data-sharing notice before analysis; synthetic data only in this repo.

## Roadmap

1. Bangla drafts and fuller Bangla localization reviewed by native speakers.
2. Scanned-PDF support.
3. Lawyer-reviewed playbook defaults and clause templates for Bangladesh.
4. Pilot with real freelancers; measure review time and issues caught.
5. More preferences, more contract types, and a privacy-preserving model option for confidential contracts.

## Team Mythic Order

- **Md. Ahsan Munna** (team lead): architecture and development
- **Md. Mirajul Islam**: product and UX
- **Abdullah-Al-Rashed Khan**: domain expertise (contracts and freelancing practice)

Built with AI coding assistants (Claude, Antigravity). All code was reviewed and tested by the team.

## License

[MIT](LICENSE)

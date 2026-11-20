import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation & Architecture — Chukti AI",
  description:
    "System architecture, technical whitepaper, and risk rules reference for Chukti AI — contract protection copilot for Bangladeshi freelance developers.",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans selection:bg-teal-500/20">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold tracking-tight text-slate-900 dark:text-white hover:opacity-90 transition-opacity"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-teal-700 dark:text-teal-400"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="m9 15 2 2 4-4" />
              </svg>
              <span className="text-base sm:text-lg">Chukti AI</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-700 select-none">/</span>
            <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
              docs
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 transition-colors"
          >
            <span>Live App</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M5 10a.75.75 0 01.75-.75h6.638L9.23 6.09a.75.75 0 011.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.04-1.08l3.158-3.16H5.75A.75.75 0 015 10z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-16 sm:space-y-20">
        {/* ========================================================================= */}
        {/* 1. HERO SECTION                                                          */}
        {/* ========================================================================= */}
        <section className="space-y-6 pt-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-teal-50/80 px-3 py-1 text-xs font-medium text-teal-800 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-600 dark:bg-teal-400"></span>
            Technical Whitepaper & System Architecture
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            Chukti AI
          </h1>

          <p className="text-lg sm:text-2xl font-medium text-slate-700 dark:text-slate-300 leading-snug">
            A Bangla/English contract-protection copilot for Bangladeshi freelance developers and small software agencies
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 transition-colors"
            >
              Open Live App
            </Link>
            <a
              href="#rules"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
            >
              Explore v5 Rules Engine ↓
            </a>
          </div>

          <div className="mt-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Project & Authors
            </h2>
            <div className="mt-2 text-sm text-slate-700 dark:text-slate-300 space-y-1">
              <p>
                <strong className="text-slate-900 dark:text-white">Team:</strong> Team Mythic Order (Md. Ahsan Munna, Md. Mirajul Islam, Abdullah-Al-Rashed Khan)
              </p>
              <p>
                <strong className="text-slate-900 dark:text-white">Competition:</strong> International AI Builders Congress 2026 (&ldquo;Idea to Unicorn&rdquo;)
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 2. PROBLEM STATEMENT                                                     */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Context & Need
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
              The Problem
            </h2>
          </div>

          <p className="text-base sm:text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
            Freelancers and small agency owners in Bangladesh frequently sign cross-border Master Services Agreements (MSAs) and Statements of Work (SOWs) written in foreign English under foreign jurisdictions, without the budget or access to international legal counsel. Most developers simply sign, exposing themselves to severe financial and legal vulnerabilities.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-red-200/80 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 p-5">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-sm">
                <span className="h-2 w-2 rounded-full bg-red-600 dark:bg-red-400"></span>
                Delayed Payment Tied to Subjective Acceptance
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Payment clocks (e.g. net 60 days) start only after unilateral client &ldquo;acceptance,&rdquo; allowing clients to postpone invoices indefinitely without objective criteria.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-5">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-400"></span>
                Immediate IP Transfer Before Payment
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Code ownership transfers automatically upon creation or delivery. If the client refuses to pay, the contractor has already surrendered copyright and retains zero leverage.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-5">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-400"></span>
                Uncapped Liability & One-Sided Indemnity
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Agreements missing contractor liability caps or imposing broad, unilateral indemnities for consequential damages that can exceed the entire contract value by orders of magnitude.
              </p>
            </div>

            <div className="rounded-xl border border-red-200/80 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 p-5">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-sm">
                <span className="h-2 w-2 rounded-full bg-red-600 dark:bg-red-400"></span>
                Unilateral Termination Without Payment for Work
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Clients can terminate for convenience with zero notice, stipulating no compensation or payment only for previously invoiced work, leaving active milestones uncompensated.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3. CORE PRINCIPLE                                                        */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Foundational Architecture
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
              Core Principle: &ldquo;AI Reads, Rules Decide&rdquo;
            </h2>
          </div>

          <p className="text-base sm:text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
            Legal risk analysis demands strict determinism, auditability, and zero hallucination. Chukti AI separates probabilistic text extraction from legal judgment:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 font-bold text-sm">
                a
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                Deterministic LLM Extraction
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                The LLM acts purely as a structured extractor. Calls run at <strong>temperature 0</strong> with native Gemini <strong>JSON schema enforcement</strong> (<code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">responseMimeType: &quot;application/json&quot;</code>) to extract clauses and label specific facts.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 font-bold text-sm">
                b
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                Verbatim Grounding Verifier
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Every extracted quote is checked character-for-character against the raw PDF document text. Any quote not found verbatim as a contiguous block is automatically rejected and dropped before it reaches storage or the user.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 font-bold text-sm">
                c
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                Deterministic Rule Engine
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Fixed, unit-tested TypeScript functions compare the extracted facts against the user&apos;s playbook preferences to assign severities, trigger warnings, and assemble counter-proposals from parameterized templates.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/60 dark:bg-teal-950/30 p-4 text-sm text-teal-950 dark:text-teal-200 flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="leading-relaxed">
              <strong>Hard Boundary:</strong> The LLM <strong>never</strong> assigns risk severities, calculates priority scores, or writes free-form legal advice. The same facts evaluated against the same playbook will always yield the exact same deterministic findings.
            </p>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. PIPELINE DIAGRAM                                                      */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              System Execution
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
              End-to-End Pipeline
            </h2>
          </div>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            Below is the operational flow of a contract analysis in Chukti AI, executed without external workflow brokers:
          </p>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm overflow-hidden">
            <div className="flex flex-col gap-3">
              {/* Step 1 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400 uppercase">Input</span>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">PDF Upload</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Single-column text-based contract document</div>
                </div>
              </div>

              {/* Down Arrow */}
              <div className="flex justify-center text-slate-400 dark:text-slate-600 font-bold text-base leading-none py-0.5">↓</div>

              {/* Step 2 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400 uppercase">Text Extraction</span>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">unpdf Text Extraction</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Per-page text extraction with boundary preservation</div>
                </div>
              </div>

              <div className="flex justify-center text-slate-400 dark:text-slate-600 font-bold text-base leading-none py-0.5">↓</div>

              {/* Step 3 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-teal-300 dark:border-teal-700/60 bg-teal-50/50 dark:bg-teal-950/20 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400 uppercase">AI Stage 1</span>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Stage 1 Clause Extraction (Gemini 3.6 Flash)</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Extracts 8 legal clause types with structured JSON schema</div>
                </div>
              </div>

              <div className="flex justify-center text-slate-400 dark:text-slate-600 font-bold text-base leading-none py-0.5">↓</div>

              {/* Step 4 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 uppercase">Grounding Gate</span>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Grounding Verifier</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Exact character-for-character check against raw document (unmatched dropped)</div>
                </div>
              </div>

              <div className="flex justify-center text-slate-400 dark:text-slate-600 font-bold text-base leading-none py-0.5">↓</div>

              {/* Step 5 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-teal-300 dark:border-teal-700/60 bg-teal-50/50 dark:bg-teal-950/20 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400 uppercase">AI Stage 2</span>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Stage 2 Fact Extraction (Gemini 3.6 Flash)</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Batched fact extraction mapped to markers C1..Cn</div>
                </div>
              </div>

              <div className="flex justify-center text-slate-400 dark:text-slate-600 font-bold text-base leading-none py-0.5">↓</div>

              {/* Step 6 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-indigo-300 dark:border-indigo-700/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400 uppercase">Safety Safeguards</span>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Evidence Verification + Lexical Backstops</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Quote containment verification & regex fallbacks for termination keywords</div>
                </div>
              </div>

              <div className="flex justify-center text-slate-400 dark:text-slate-600 font-bold text-base leading-none py-0.5">↓</div>

              {/* Step 7 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 uppercase">Deterministic Logic</span>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Rule Engine (with User Playbook)</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Evaluates 14 risk rules against user&apos;s 5-preference playbook</div>
                </div>
              </div>

              <div className="flex justify-center text-slate-400 dark:text-slate-600 font-bold text-base leading-none py-0.5">↓</div>

              {/* Step 8 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400 uppercase">Outputs</span>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Findings, Counter-Proposals & Client Message</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Prioritized risk findings, side-by-side wording, and ready-to-send draft</div>
                </div>
              </div>

              <div className="flex justify-center text-slate-400 dark:text-slate-600 font-bold text-base leading-none py-0.5">↓</div>

              {/* Step 9 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-teal-400 dark:border-teal-500 bg-teal-100/70 dark:bg-teal-900/40 p-3 text-center sm:text-left">
                  <span className="text-xs font-mono font-bold text-teal-800 dark:text-teal-300 uppercase">User Interface</span>
                  <div className="text-sm font-semibold text-slate-950 dark:text-white">Bilingual UI (English & Bangla)</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">Synchronized 3-pane view with verbatim contract jump-to-clause highlighting</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 5. RISK RULES TABLE (v5)                                                 */}
        {/* ========================================================================= */}
        <section id="rules" className="space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Deterministic Logic
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
              Risk Rules Reference (v5)
            </h2>
          </div>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            The Chukti AI engine evaluates verified contract facts against 14 risk rules from <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">docs/RULES.md</code>. Severities are assigned deterministically:
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  <th scope="col" className="py-3 px-4 w-24">Code</th>
                  <th scope="col" className="py-3 px-4 w-32">Category</th>
                  <th scope="col" className="py-3 px-4 w-36">Severity</th>
                  <th scope="col" className="py-3 px-4">Trigger & Logic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-normal">
                {/* PAY-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">PAY-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Payment</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      High / Medium
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">days_to_pay &gt; playbook.payment_terms.max_days_to_pay</code>. High if <code className="font-mono text-xs">days_to_pay &gt;= 2 * max_days_to_pay</code>, otherwise medium. Records clock start if trigger is acceptance.
                  </td>
                </tr>

                {/* PAY-2 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">PAY-2</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Payment</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Medium
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">payment_trigger in [acceptance, delivery_and_acceptance] OR client_may_withhold = for_unaccepted_work</code>. Protects against delayed triggers and unilateral withholding.
                  </td>
                </tr>

                {/* PAY-3 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">PAY-3</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Payment</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                      Low + Lawyer
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    No payment clause present in contract, OR <code className="font-mono text-xs">days_to_pay</code> unspecified. Flagged for lawyer review due to missing timeline.
                  </td>
                </tr>

                {/* LIAB-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">LIAB-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Liability</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      High / Med + Lawyer
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">require_cap = true</code> AND (<code className="font-mono text-xs">contractor_liability = unlimited</code> OR <code className="font-mono text-xs">cap_multiple_of_fees &gt; max_multiple_of_fees</code> OR liability cap unspecified).
                  </td>
                </tr>

                {/* IP-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">IP-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">IP Ownership</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      High / Med / Low
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    Evaluates transfer timing against playbook. When preferring full payment: High for <code className="font-mono text-xs">on_creation</code>, Medium for <code className="font-mono text-xs">on_delivery</code>. <code className="font-mono text-xs">conditional_on_payment = no</code> treated as <code className="font-mono text-xs">on_creation</code>.
                  </td>
                </tr>

                {/* TERM-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">TERM-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Termination</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      High / Medium
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">client_convenience_termination = yes AND notice_days &lt; min_notice_days</code>. High when <code className="font-mono text-xs">notice_days = 0</code> (immediate termination without notice), otherwise medium. Backstop recovers omissions.
                  </td>
                </tr>

                {/* TERM-2 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">TERM-2</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Termination</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      High / Medium
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">pay_for_work_done = true AND payment_for_work_done in [none, only_invoiced]</code>. High if contractor receives no compensation; medium if paid only for previously invoiced work.
                  </td>
                </tr>

                {/* SCOPE-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">SCOPE-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Scope Change</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      High / Medium
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">require_written_change_order = true</code> AND (<code className="font-mono text-xs">written_change_order_required = no</code> OR <code className="font-mono text-xs">extra_work_without_additional_fee = yes</code>). High if both violated.
                  </td>
                </tr>

                {/* LAW-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">LAW-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Governing Law</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Medium + Lawyer
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">foreign_to_bangladesh = yes</code>. Flagged for lawyer review due to cross-border jurisdiction, forum expenses, and local enforceability barriers. Evaluated deterministically in code.
                  </td>
                </tr>

                {/* IND-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">IND-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Indemnity</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                      High
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">indemnifying_party = contractor AND scope = broad</code>. Protects against one-sided, open-ended indemnity obligations.
                  </td>
                </tr>

                {/* DEF-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">DEF-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Definitions</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Medium
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    Definition clause with <code className="font-mono text-xs">includes_indirect_or_consequential_losses = yes</code>. Protects from expansive defined losses including consequential damages.
                  </td>
                </tr>

                {/* ACC-1 */}
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">ACC-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Acceptance</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                      High
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <code className="font-mono text-xs">acceptance_decider = client_sole</code> AND payment depends on acceptance. Protects against unilateral client discretion controlling invoice payment.
                  </td>
                </tr>

                {/* COMBO-1 */}
                <tr className="hover:bg-red-50/40 dark:hover:bg-red-950/20 bg-red-50/20 dark:bg-red-950/10">
                  <td className="py-3 px-4 font-mono font-bold text-red-700 dark:text-red-400">COMBO-1</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">Compound Risk</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-bold bg-red-600 text-white dark:bg-red-700">
                      Critical + Lawyer
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200 text-xs leading-relaxed">
                    <strong>IP-1 (High/Med) + PAY-1 (Triggered):</strong> Intellectual property transfers on creation or delivery (<code className="font-mono text-xs">conditional_on_payment = no</code>), but payment is delayed or extended. The freelancer forfeits code ownership before receiving compensation.
                  </td>
                </tr>

                {/* COMBO-2 */}
                <tr className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 bg-amber-50/20 dark:bg-amber-950/10">
                  <td className="py-3 px-4 font-mono font-bold text-amber-700 dark:text-amber-400">COMBO-2</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">Compound Risk</td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                      High + Lawyer
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200 text-xs leading-relaxed">
                    <strong>IP-1 (Early Transfer) + TERM-2 (No Payment on Termination):</strong> Client retains rights to work product while terminating for convenience without paying for completed or in-progress work.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 6. TECH STACK GROUPED                                                    */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Implementation Details
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
              Tech Stack
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Frontend & Routing
              </h3>
              <ul className="mt-2 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <li><strong>Next.js 16:</strong> App Router, Turbopack, route handlers, server components.</li>
                <li><strong>React 19:</strong> React Server Components + reactive interactive client panes.</li>
                <li><strong>Tailwind CSS v4:</strong> Theme variables, responsive layouts, accessible contrast.</li>
                <li><strong>TypeScript:</strong> Strict static type-checking (<code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">tsc --noEmit</code>).</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Data & Validation
              </h3>
              <ul className="mt-2 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <li><strong>unpdf:</strong> Serverless-friendly page-by-page PDF text extraction.</li>
                <li><strong>zod:</strong> Strict runtime schema validation for LLM inputs and outputs.</li>
                <li><strong>pdf-lib:</strong> PDF generation used exclusively for synthetic test fixtures.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Backend & Storage
              </h3>
              <ul className="mt-2 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <li><strong>Supabase PostgreSQL:</strong> Relational data store for documents, clauses, and runs.</li>
                <li><strong>Row-Level Security (RLS):</strong> Deny-by-default access policies; service-role key restricted to server.</li>
                <li><strong>Concurrency Guard:</strong> Unique index constraints preventing parallel duplicate runs.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Artificial Intelligence (LLM)
              </h3>
              <ul className="mt-2 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <li><strong>Google Gemini 3.6 Flash:</strong> Primary model for fast, structured JSON extraction.</li>
                <li><strong>Configurable Fallback Model:</strong> Automatic failover on 429/503 errors.</li>
                <li><strong>Custom Fetch Client:</strong> Zero external SDK bloat; exponential backoff, thought-token filtering, and timeout budgets.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Quality Assurance
              </h3>
              <ul className="mt-2 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <li><strong>Vitest:</strong> Unit tests for extraction schemas, fact parsing, rules, and error paths.</li>
                <li><strong>Synthetic Benchmarks:</strong> 7 synthetic contract fixtures for regression verification.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Hosting & Developer Tooling
              </h3>
              <ul className="mt-2 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <li><strong>Hosting:</strong> Vercel edge deployment with serverless functions.</li>
                <li><strong>Developer Tooling:</strong> Cursor IDE with <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">AGENTS.md</code> agent instructions.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 7. EVALUATION                                                            */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Benchmark Metrics
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
              Evaluation & Accuracy
            </h2>
          </div>

          <div className="rounded-xl border border-teal-200 dark:border-teal-800/80 bg-teal-50/50 dark:bg-teal-950/20 p-6 shadow-sm">
            <p className="text-base sm:text-lg font-semibold text-teal-950 dark:text-teal-200">
              &ldquo;On 7 synthetic benchmark contracts, Chukti AI identified 25 of 26 expected risks with 0 false alarms.&rdquo;
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              <strong>Important Transparency Notice:</strong> These results reflect test runs across synthetic, public contracts created for research in <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">tests/contracts/</code>. They do <strong>not</strong> represent a claim of real-world accuracy across arbitrary commercial contracts, which vary widely in formatting, scanned quality, and jurisdictional nuance.
            </p>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 8. DESIGN DECISIONS                                                      */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Engineering Tradeoffs
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
              Deliberate Design Decisions
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-2">
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                No RAG or Vector Database
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Chunking contracts into vector embeddings risks slicing critical clauses in half and breaking cross-clause definitions. Chukti AI loads and analyzes the complete contract page by page, ensuring total context preservation.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-2">
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                No External Workflow Platforms
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                We deliberately avoided third-party workflow automation platforms (such as n8n, Zapier, or LangGraph). Pipeline orchestration runs natively in typed TypeScript services within Next.js for sub-second execution, zero webhook failure points, and tight error handling.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-2">
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                No Free-Form LLM Drafts
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                All counter-proposals and ready-to-send client negotiation messages are generated from deterministic, parameterized templates written by legal domain experts—not invented dynamically by generative models.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 9. PRIVACY & ROADMAP                                                     */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Security & Future Plans
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
              Privacy Notice & Roadmap
            </h2>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">
              Current Privacy Model (from docs/DATA_AND_PRIVACY.md)
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Contract text extracted from uploaded PDFs is sent directly to the Google Gemini API for clause and fact extraction. Because the prototype operates on Gemini&apos;s free tier (where Google may retain data for product improvements), users are explicitly warned before analysis not to upload confidential contracts or agreements covered by Non-Disclosure Agreements (NDAs). Document data and analysis records are securely stored in a Supabase PostgreSQL database with Row-Level Security (RLS) enabled. All development, testing, and live demos use synthetic contracts.
            </p>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  PLANNED &mdash; NOT IMPLEMENTED
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Future Roadmap
                </span>
              </div>
              <h4 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                Local On-Device Inference (Ollama / llama.cpp)
              </h4>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                To enable 100% confidential NDA processing, our roadmap includes an on-device open-weight model option (e.g., Llama 3.1 or Qwen 2.5 via Ollama or llama.cpp). This will ensure zero bytes of sensitive contract text ever leave the freelancer&apos;s personal workstation.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-8 pb-12 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
          <p>
            Chukti AI is a prototype contract review aid and <strong>does not provide legal advice</strong>. Always consult a qualified legal professional before signing binding agreements.
          </p>
          <p>
            Built by <strong>Team Mythic Order</strong> for the <strong>International AI Builders Congress 2026</strong>.
          </p>
        </footer>
      </main>
    </div>
  );
}

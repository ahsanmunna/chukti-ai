const PIPELINE_STEPS = [
  {
    step: "Step 1",
    title: "Upload Contract PDF & Extract Page-Referenced Text",
    status: "Not implemented",
    detail: "Text-based MSA/SOW PDF upload and per-page extraction (scanned/OCR PDFs rejected explicitly).",
  },
  {
    step: "Step 2",
    title: "5-Preference Playbook",
    status: "Not implemented",
    detail: "Liability cap, payment terms (max days), IP ownership, termination, and scope changes saved per document.",
  },
  {
    step: "Step 3",
    title: "Clause Extraction & Verbatim Grounding",
    status: "Not implemented",
    detail: "Schema-validated extraction with deterministic verbatim substring verification.",
  },
  {
    step: "Step 4–6",
    title: "Risk Prioritization, Clause Interactions & Explanations",
    status: "Not implemented",
    detail: "Deterministic rule checks, curated DB interaction rules, foreign-law flags, and EN/BN explanations.",
  },
  {
    step: "Step 7–9",
    title: "Counter-Clauses, User Approval & Side-by-Side Export",
    status: "Not implemented",
    detail: "Per-change user approval, obligations JSON export, and side-by-side DOCX comparison table.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Chukti AI — International MSA/SOW Review Copilot
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Built for Bangladeshi freelance developers and small agencies reviewing international
          Master Services Agreements and Statements of Work. This repository is currently at
          <strong className="font-semibold text-slate-800"> Step 0 (skeleton)</strong>:
          database schema, environment validation, and health check are active; analysis stages
          below are explicitly marked not implemented until their respective build steps.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Workflow Status
        </h2>
        <div className="grid gap-3">
          {PIPELINE_STEPS.map((item) => (
            <div
              key={item.step}
              className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">{item.step}</span>
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                </div>
                <p className="mt-1 text-xs text-slate-600">{item.detail}</p>
              </div>
              <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

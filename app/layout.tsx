import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chukti AI — Contract Protection Copilot",
  description:
    "Contract review copilot for Bangladeshi freelance developers and small agencies signing international MSA/SOW agreements.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div
          role="banner"
          className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-950"
        >
          Not legal advice: Chukti AI assists with contract review prioritization and drafting only. Have a qualified lawyer review important terms, low-confidence findings, and governing-law risks before signing.
        </div>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <div>
              <span className="text-lg font-semibold tracking-tight text-slate-900">
                Chukti AI
              </span>
              <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                MVP Skeleton (Step 0)
              </span>
            </div>
            <a
              href="/api/health"
              className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              API Health
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

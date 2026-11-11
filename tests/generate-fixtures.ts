import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

const SYNTHETIC_PAGES: ReadonlyArray<ReadonlyArray<string>> = [
  [
    "SYNTHETIC MASTER SERVICES AGREEMENT (TEST FIXTURE)",
    "1. Engagement and Scope of Services",
    "Contractor agrees to design and deliver software modules described in each Statement of Work.",
    "Any expansion of deliverables, schedule, or technical milestones requires a signed written change order.",
    "No oral request or informal chat message shall alter the agreed delivery fee or project timeline.",
  ],
  [
    "2. Fees, Invoicing, and Payment Schedule",
    "Client shall pay undisputed invoices within forty-five (45) calendar days from receipt of invoice.",
    "Late balances accrue simple interest as permitted by commercial agreement between the parties.",
    "3. Intellectual Property Transfer",
    "All custom source code and project deliverables become Client property upon delivery to repository.",
  ],
  [
    "4. Limitation of Liability and Termination",
    "Neither party limits financial liability for direct, indirect, or consequential project damages.",
    "Client may terminate this agreement immediately upon written notice without paying incomplete milestones.",
    "Contractor shall cooperate with transition handover for ten (10) business days following notice.",
  ],
];

export interface GeneratedFixturePaths {
  textPdf: string;
  noTextPdf: string;
  renamedTxtPdf: string;
  emptyPdf: string;
}

export async function generateSyntheticFixtures(
  targetDir = FIXTURES_DIR,
): Promise<GeneratedFixturePaths> {
  fs.mkdirSync(targetDir, { recursive: true });

  // 1. 3-page synthetic text-based contract PDF
  const textDoc = await PDFDocument.create();
  const font = await textDoc.embedFont(StandardFonts.Helvetica);

  for (const lines of SYNTHETIC_PAGES) {
    const page = textDoc.addPage([612, 792]);
    let y = 730;
    for (let i = 0; i < lines.length; i++) {
      const size = i === 0 ? 14 : 11;
      page.drawText(lines[i], {
        x: 56,
        y,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= i === 0 ? 32 : 24;
    }
  }

  const textPdfBytes = await textDoc.save();
  const textPdfPath = path.join(targetDir, "fixture-synthetic-text.pdf");
  fs.writeFileSync(textPdfPath, textPdfBytes);

  // 2. 3-page synthetic shapes-only PDF (no text layer)
  const noTextDoc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) {
    const page = noTextDoc.addPage([612, 792]);
    page.drawRectangle({
      x: 60,
      y: 620,
      width: 492,
      height: 80,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 1.5,
    });
    page.drawLine({
      start: { x: 60, y: 560 - i * 20 },
      end: { x: 552, y: 560 - i * 20 },
      thickness: 2,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  const noTextPdfBytes = await noTextDoc.save();
  const noTextPdfPath = path.join(targetDir, "fixture-synthetic-no-text.pdf");
  fs.writeFileSync(noTextPdfPath, noTextPdfBytes);

  // 3. Plain .txt file renamed to .pdf
  const renamedTxtPath = path.join(targetDir, "fixture-synthetic-renamed-txt.pdf");
  fs.writeFileSync(
    renamedTxtPath,
    "This is a plain text file renamed with a .pdf extension for synthetic negative testing.\n",
    "utf8",
  );

  // 4. Empty 0-byte file
  const emptyPdfPath = path.join(targetDir, "fixture-synthetic-empty.pdf");
  fs.writeFileSync(emptyPdfPath, Buffer.alloc(0));

  return {
    textPdf: textPdfPath,
    noTextPdf: noTextPdfPath,
    renamedTxtPdf: renamedTxtPath,
    emptyPdf: emptyPdfPath,
  };
}

const isExecutedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  generateSyntheticFixtures()
    .then((paths) => {
      console.log("Generated synthetic Phase 1 fixtures:", Object.values(paths).map((p) => path.basename(p)));
    })
    .catch((err) => {
      console.error("Failed to generate fixtures:", err);
      process.exit(1);
    });
}

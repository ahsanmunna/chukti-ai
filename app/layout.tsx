import type { Metadata } from "next";
import { Noto_Sans_Bengali, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const uiSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-ui-sans",
  display: "swap",
});

const bnSans = Noto_Sans_Bengali({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bn-sans",
  display: "swap",
});

const contractSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-contract-serif",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${uiSans.variable} ${bnSans.variable} ${contractSerif.variable}`}
    >
      <body className="min-h-screen antialiased bg-surface-canvas text-text-primary">
        {children}
      </body>
    </html>
  );
}

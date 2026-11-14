import { describe, expect, it } from "vitest";
import bn from "@/lib/i18n/bn.json";
import en from "@/lib/i18n/en.json";
import { getPlaybookFieldErrorMessage, getUploadErrorMessage } from "@/lib/ui/messages";

describe("F1 upload error messages", () => {
  it("returns exact expected English copy for all known error codes", () => {
    expect(getUploadErrorMessage("not_pdf", "en")).toBe(
      "This file isn't a PDF. Please upload a PDF contract.",
    );
    expect(getUploadErrorMessage("too_large", "en")).toBe(
      "This file is larger than 10 MB. Please upload a smaller PDF.",
    );
    expect(getUploadErrorMessage("too_many_pages", "en")).toBe(
      "This PDF has more than 80 pages. Please upload a shorter document.",
    );
    expect(getUploadErrorMessage("encrypted", "en")).toBe(
      "This PDF is password-protected. Remove the password and upload it again.",
    );
    expect(getUploadErrorMessage("corrupt", "en")).toBe(
      "We couldn't read this PDF. The file may be damaged.",
    );
    expect(getUploadErrorMessage("scanned_unsupported", "en")).toBe(
      "This PDF looks like a scan or an image, so there is no text to read. Only text-based PDFs are supported for now.",
    );
    expect(getUploadErrorMessage("network_error", "en")).toBe(
      "Upload failed. Check your connection and try again.",
    );
    expect(getUploadErrorMessage("timeout", "en")).toBe(
      "The upload took too long. Please try again.",
    );

    const genericCodes = [
      "invalid_request",
      "missing_file",
      "storage_error",
      "database_error",
      "service_unavailable",
      "internal_error",
      "not_found",
      "invalid_id",
      "unknown",
    ];

    for (const code of genericCodes) {
      expect(getUploadErrorMessage(code, "en")).toBe(
        "Something went wrong on our side. Please try again.",
      );
    }
  });

  it("returns localized Bangla copy for known error codes without technical jargon", () => {
    expect(getUploadErrorMessage("not_pdf", "bn")).toContain("PDF");
    expect(getUploadErrorMessage("not_pdf", "bn")).not.toContain("%PDF-");
    expect(getUploadErrorMessage("scanned_unsupported", "bn")).not.toContain("OCR");
    expect(getUploadErrorMessage("network_error", "bn")).toContain("ইন্টারনেট");
    expect(getUploadErrorMessage("timeout", "bn")).toContain("সময়");
    expect(getUploadErrorMessage("too_large", "bn")).toContain("১০ মেগাবাইট");
  });

  it("falls back to generic message for unknown, null, or undefined codes in both locales", () => {
    expect(getUploadErrorMessage("non_existent_code", "en")).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(getUploadErrorMessage("non_existent_code", "bn")).toBe(
      "আমাদের সিস্টেমে কোনো সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
    );
    expect(getUploadErrorMessage(null, "en")).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(getUploadErrorMessage(undefined, "bn")).toBe(
      "আমাদের সিস্টেমে কোনো সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
    );
  });
});

describe("F2 playbook field error messages", () => {
  it("returns exact expected English copy for specific playbook field keys", () => {
    expect(
      getPlaybookFieldErrorMessage("liability_cap.max_multiple_of_fees", "en"),
    ).toBe("Enter a number from 0.5 to 10.");
    expect(
      getPlaybookFieldErrorMessage("payment_terms.max_days_to_pay", "en"),
    ).toBe("Enter a whole number from 1 to 120.");
    expect(
      getPlaybookFieldErrorMessage("termination.min_notice_days", "en"),
    ).toBe("Enter a whole number from 0 to 90.");
    expect(getPlaybookFieldErrorMessage("ip_ownership", "en")).toBe(
      "Choose one of the options.",
    );
  });

  it("returns natural Bangla copy for specific playbook field keys", () => {
    expect(
      getPlaybookFieldErrorMessage("liability_cap.max_multiple_of_fees", "bn"),
    ).toBe("০.৫ থেকে ১০-এর মধ্যে একটি সংখ্যা লিখুন।");
    expect(
      getPlaybookFieldErrorMessage("payment_terms.max_days_to_pay", "bn"),
    ).toBe("১ থেকে ১২০-এর মধ্যে একটি পূর্ণসংখ্যা লিখুন।");
    expect(
      getPlaybookFieldErrorMessage("termination.min_notice_days", "bn"),
    ).toBe("০ থেকে ৯০-এর মধ্যে একটি পূর্ণসংখ্যা লিখুন।");
    expect(getPlaybookFieldErrorMessage("ip_ownership", "bn")).toBe(
      "যেকোনো একটি বিকল্প বেছে নিন।",
    );
  });

  it("returns fallback message for any other field or unknown paths in both locales", () => {
    expect(
      getPlaybookFieldErrorMessage("termination.pay_for_work_done", "en"),
    ).toBe("Check this value.");
    expect(
      getPlaybookFieldErrorMessage("termination.pay_for_work_done", "bn"),
    ).toBe("এই মানটি যাচাই করুন।");
    expect(getPlaybookFieldErrorMessage("arbitrary_unknown_field", "en")).toBe(
      "Check this value.",
    );
    expect(getPlaybookFieldErrorMessage("arbitrary_unknown_field", "bn")).toBe(
      "এই মানটি যাচাই করুন।",
    );
    expect(getPlaybookFieldErrorMessage(null, "en")).toBe("Check this value.");
    expect(getPlaybookFieldErrorMessage(undefined, "bn")).toBe("এই মানটি যাচাই করুন।");
  });
});

describe("F8 dictionary parity check", () => {
  function getSortedKeyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
    const paths: string[] = [];
    for (const key of Object.keys(obj)) {
      const current = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        paths.push(...getSortedKeyPaths(value as Record<string, unknown>, current));
      } else {
        paths.push(current);
      }
    }
    return paths.sort();
  }

  it("en.json and bn.json have identical key sets and removed header.phaseLabel", () => {
    const enKeys = getSortedKeyPaths(en);
    const bnKeys = getSortedKeyPaths(bn);

    expect(enKeys).toEqual(bnKeys);
    expect(enKeys).not.toContain("header.phaseLabel");
    expect(enKeys).toContain("tabs.groupLabel");
    expect(enKeys).toContain("documentPane.demoNotice");
    expect(enKeys).toContain("playbookPane.loadErrorTitle");
    expect(enKeys).toContain("playbookPane.retryButton");
  });
});

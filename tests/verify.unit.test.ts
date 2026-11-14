import { describe, expect, it } from "vitest";
import {
  buildSearchKey,
  findQuote,
  verifyClauses,
} from "@/lib/extraction/verify";
import type { RawClause } from "@/lib/extraction/types";

describe("D. Verifier: buildSearchKey and findQuote", () => {
  it("normalizes ligature 'fi' and maps both key characters to original index", () => {
    const orig = "The speci\uFB01c terms apply to both parties.";
    const { key, map } = buildSearchKey(orig);

    expect(key).toBe("The specific terms apply to both parties.");
    const fiOrigIndex = orig.indexOf("\uFB01");
    const fiKeyIndex = key.indexOf("fi");

    expect(map[fiKeyIndex]).toBe(fiOrigIndex);
    expect(map[fiKeyIndex + 1]).toBe(fiOrigIndex);
  });

  it("normalizes non-breaking space (NBSP) to a regular space", () => {
    const orig = "Payment\u00A0due\u00A0within\u00A030\u00A0days.";
    const { key } = buildSearchKey(orig);
    expect(key).toBe("Payment due within 30 days.");
  });

  it("removes soft hyphens and zero-width characters", () => {
    const orig = "The agree\u00ADment and docu\u200Bment are bind\uFEFFing.";
    const { key } = buildSearchKey(orig);
    expect(key).toBe("The agreement and document are binding.");
  });

  it("removes a hyphen immediately followed by a line break and a lowercase letter (de-hyphenation)", () => {
    const orig = "This contract allows for immediate termi-\nnation upon written notice.";
    const { key } = buildSearchKey(orig);
    expect(key).toBe("This contract allows for immediate termination upon written notice.");

    const origWindows = "Another termi-\r\nnation clause here.";
    const resWindows = buildSearchKey(origWindows);
    expect(resWindows.key).toBe("Another termination clause here.");
  });

  it("unifies curly single and double quotes to straight quotes, and en/em dashes and U+2212 to hyphen", () => {
    const orig = "“Provider” and ‘Client’ agree — term – condition − payment.";
    const { key } = buildSearchKey(orig);
    expect(key).toBe('"Provider" and \'Client\' agree - term - condition - payment.');
  });

  it("collapses multiple spaces into one space", () => {
    const orig = "Fee     schedule     and     invoicing.";
    const { key } = buildSearchKey(orig);
    expect(key).toBe("Fee schedule and invoicing.");
  });

  it("normalizes newlines to spaces and collapses whitespace runs", () => {
    const orig = "First sentence.\n\nSecond sentence with \t tabs.";
    const { key } = buildSearchKey(orig);
    expect(key).toBe("First sentence. Second sentence with tabs.");
  });

  it("matches a quote spanning two lines", () => {
    const pageText =
      "Section 4. Payment.\nAll invoices are payable within 30 days of\nreceipt by the client.";
    const quote = "All invoices are payable within 30 days of receipt by the client.";
    const pageKey = {
      page_number: 1,
      text: pageText,
      searchKey: buildSearchKey(pageText),
    };

    const match = findQuote([pageKey], quote, 1);
    expect("reason" in match).toBe(false);
    if (!("reason" in match)) {
      expect(match.page_number).toBe(1);
      const slice = pageText.slice(match.char_start, match.char_end);
      expect(buildSearchKey(slice).key).toBe(buildSearchKey(quote).key);
    }
  });

  it("verifies offsets map back correctly: page.text.slice(start, end) yields text whose key equals quote key", () => {
    const pageText =
      "Preamble. The client agrees that immediate speci\uFB01c termi-\nnation of this agree\u00ADment is “strictly required”. Epilogue.";
    const quote = 'immediate specific termination of this agreement is "strictly required".';
    const pageKey = {
      page_number: 1,
      text: pageText,
      searchKey: buildSearchKey(pageText),
    };

    const match = findQuote([pageKey], quote, 1);
    expect("reason" in match).toBe(false);
    if (!("reason" in match)) {
      const slice = pageText.slice(match.char_start, match.char_end);
      expect(buildSearchKey(slice).key).toBe(buildSearchKey(quote).key);
    }
  });

  it("rejects quotes shorter than 25 key characters with too_short", () => {
    const pageText = "Short text here that is long enough on page.";
    const quote = "Short text"; // 10 chars
    const pageKey = {
      page_number: 1,
      text: pageText,
      searchKey: buildSearchKey(pageText),
    };

    const match = findQuote([pageKey], quote, 1);
    expect(match).toEqual({ reason: "too_short" });
  });

  it("rejects paraphrased quotes with not_found", () => {
    const pageText =
      "The service provider will deliver all source code upon payment of all outstanding invoices.";
    const paraphrase =
      "The vendor must give the source code once all invoices are completely paid.";
    const pageKey = {
      page_number: 1,
      text: pageText,
      searchKey: buildSearchKey(pageText),
    };

    const match = findQuote([pageKey], paraphrase, 1);
    expect(match).toEqual({ reason: "not_found" });
  });

  it("corrects a wrong page_hint and sets pageMismatch to true", () => {
    const page1Text = "Section 5. The contractor shall maintain adequate insurance at all times.";
    const page2Text = "Section 6. Miscellaneous notices shall be sent by certified email.";
    const quote = "The contractor shall maintain adequate insurance at all times.";

    const pages = [
      { page_number: 1, text: page1Text, searchKey: buildSearchKey(page1Text) },
      { page_number: 2, text: page2Text, searchKey: buildSearchKey(page2Text) },
    ];

    // Model guessed page 2, but quote is on page 1
    const match = findQuote(pages, quote, 2);
    expect("reason" in match).toBe(false);
    if (!("reason" in match)) {
      expect(match.page_number).toBe(1);
      expect(match.pageMismatch).toBe(true);
    }
  });

  it("rejects a quote spanning across a page break", () => {
    const page1Text = "This clause begins on page one and continues to";
    const page2Text = "the second page where it finally concludes.";
    const quote = "This clause begins on page one and continues to the second page where it finally concludes.";

    const pages = [
      { page_number: 1, text: page1Text, searchKey: buildSearchKey(page1Text) },
      { page_number: 2, text: page2Text, searchKey: buildSearchKey(page2Text) },
    ];

    const match = findQuote(pages, quote, 1);
    expect(match).toEqual({ reason: "not_found" });
  });

  it("rejects a quote containing ellipses (...) not in the document", () => {
    const pageText =
      "The developer owns all pre-existing IP and the client owns custom deliverables.";
    const quote = "The developer owns all pre-existing IP ... custom deliverables.";

    const pageKey = {
      page_number: 1,
      text: pageText,
      searchKey: buildSearchKey(pageText),
    };

    const match = findQuote([pageKey], quote, 1);
    expect(match).toEqual({ reason: "not_found" });
  });

  it("deduplicates identical (type, page, start, end) clauses in verifyClauses", () => {
    const pageText =
      "In no event shall either party's aggregate liability exceed the total fees paid under this agreement.";
    const rawClauses: RawClause[] = [
      {
        clause_type: "liability",
        quote: "either party's aggregate liability exceed the total fees paid under this agreement",
        page_hint: 1,
        confidence: "high",
      },
      {
        clause_type: "liability",
        quote: "either party's aggregate liability exceed the total fees paid under this agreement",
        page_hint: 1,
        confidence: "medium",
      },
    ];

    const pages = [{ page_number: 1, text: pageText }];
    const { accepted, rejected } = verifyClauses(rawClauses, pages);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(0);
    expect(accepted[0].clause_type).toBe("liability");
    expect(accepted[0].verbatim_text).toBe(
      "either party's aggregate liability exceed the total fees paid under this agreement",
    );
  });
});

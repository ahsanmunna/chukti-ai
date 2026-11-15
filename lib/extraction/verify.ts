import type {
  RawClause,
  RejectedClause,
  VerificationResult,
  VerifiedClause,
} from "./types";

export interface MappedElement {
  char: string;
  origIndex: number;
  origLength: number;
}

export interface SearchKeyResult {
  key: string;
  map: number[];
  elements: MappedElement[];
}

export type HyphenMode = "drop" | "keep";

export interface PageKeyData {
  page_number: number;
  text: string;
  dropKey?: SearchKeyResult;
  keepKey?: SearchKeyResult;
  searchKey?: SearchKeyResult;
}

const ZERO_WIDTH_AND_SOFT_HYPHEN = /[\u00AD\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/;

/**
 * Normalizes text to a search key and produces a map from search key character indices
 * back to the character indices in the original input text.
 *
 * Steps:
 * 1. NFKC normalization per code point (when one original char expands, map all to that original index)
 * 2. Remove soft hyphens (U+00AD) and zero-width characters
 * 3. Unify curly single/double quotes to straight, en/em dashes and U+2212 to "-"
 * 4. Line-end de-hyphenation:
 *    - "drop": remove a hyphen immediately followed by a line break and a lowercase letter
 *    - "keep": keep the hyphen, remove only the line break
 * 5. Turn NBSP and every run of Unicode whitespace into one space
 * 6. Trim leading and trailing spaces
 * Case-sensitive. Pure function, no IO.
 */
export function buildSearchKey(text: string, hyphenMode: HyphenMode = "drop"): SearchKeyResult {
  const initial: MappedElement[] = [];

  for (let i = 0; i < text.length; ) {
    const code = text.charCodeAt(i);
    let codePoint: string;
    let len = 1;

    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      codePoint = text.slice(i, i + 2);
      len = 2;
    } else {
      codePoint = text[i];
      len = 1;
    }

    if (ZERO_WIDTH_AND_SOFT_HYPHEN.test(codePoint)) {
      i += len;
      continue;
    }

    const normalized = codePoint.normalize("NFKC");
    for (let cIdx = 0; cIdx < normalized.length; cIdx++) {
      let ch = normalized[cIdx];
      if (ZERO_WIDTH_AND_SOFT_HYPHEN.test(ch)) {
        continue;
      }

      // Unify quotes and dashes
      if (ch === "‘" || ch === "’" || ch === "‚" || ch === "‛" || ch === "′" || ch === "`") {
        ch = "'";
      } else if (
        ch === "“" ||
        ch === "”" ||
        ch === "„" ||
        ch === "‟" ||
        ch === "«" ||
        ch === "»" ||
        ch === "″"
      ) {
        ch = '"';
      } else if (
        ch === "–" ||
        ch === "—" ||
        ch === "―" ||
        ch === "−" ||
        ch === "\u2010" ||
        ch === "\u2011"
      ) {
        ch = "-";
      }

      initial.push({
        char: ch,
        origIndex: i,
        origLength: len,
      });
    }

    i += len;
  }

  // Line-end de-hyphenation
  const dehyphenated: MappedElement[] = [];
  for (let j = 0; j < initial.length; ) {
    const cur = initial[j];
    if (cur.char === "-") {
      let nlLen = 0;
      if (j + 1 < initial.length) {
        if (
          initial[j + 1].char === "\r" &&
          j + 2 < initial.length &&
          initial[j + 2].char === "\n"
        ) {
          nlLen = 2;
        } else if (initial[j + 1].char === "\n" || initial[j + 1].char === "\r") {
          nlLen = 1;
        }
      }

      if (nlLen > 0 && j + 1 + nlLen < initial.length) {
        const nextChar = initial[j + 1 + nlLen].char;
        if (/\p{Ll}/u.test(nextChar)) {
          if (hyphenMode === "keep") {
            dehyphenated.push(cur);
          }
          j += 1 + nlLen;
          continue;
        }
      }
    }
    dehyphenated.push(cur);
    j++;
  }

  // Turn NBSP and every run of Unicode whitespace into one space
  const collapsed: MappedElement[] = [];
  for (let k = 0; k < dehyphenated.length; ) {
    const cur = dehyphenated[k];
    if (/\s/u.test(cur.char)) {
      collapsed.push({
        char: " ",
        origIndex: cur.origIndex,
        origLength: cur.origLength,
      });
      k++;
      while (k < dehyphenated.length && /\s/u.test(dehyphenated[k].char)) {
        k++;
      }
    } else {
      collapsed.push(cur);
      k++;
    }
  }

  // Trim leading and trailing spaces
  let start = 0;
  while (start < collapsed.length && collapsed[start].char === " ") {
    start++;
  }

  let end = collapsed.length;
  while (end > start && collapsed[end - 1].char === " ") {
    end--;
  }

  const trimmed = collapsed.slice(start, end);
  const key = trimmed.map((e) => e.char).join("");
  const map = trimmed.map((e) => e.origIndex);

  return { key, map, elements: trimmed };
}

export type FindQuoteResult =
  | {
      page_number: number;
      char_start: number;
      char_end: number;
      pageMismatch: boolean;
    }
  | {
      reason: "too_short" | "too_long" | "not_found";
    };

/**
 * Finds a quote in the prepared page search keys.
 * If found on several pages, prefers page_hint page, else the earliest page.
 * If several matches in a page, takes the first.
 * page_number is ALWAYS taken from where the quote is found, never from the model.
 */
export function findQuote(
  pageKeys: PageKeyData[],
  quote: string,
  pageHint: number,
): FindQuoteResult {
  const quoteSearchKey = buildSearchKey(quote);
  const quoteKey = quoteSearchKey.key;

  if (quoteKey.length < 25) {
    return { reason: "too_short" };
  }
  if (quoteKey.length > 1500) {
    return { reason: "too_long" };
  }

  // Find all pages where the quote matches
  const sortedPages = [...pageKeys].sort((a, b) => a.page_number - b.page_number);

  const matches: Array<{
    page: PageKeyData;
    matchIndex: number;
    matchedKey: SearchKeyResult;
  }> = [];

  for (const page of sortedPages) {
    const drop = page.dropKey ?? page.searchKey ?? buildSearchKey(page.text, "drop");
    const dropIdx = drop.key.indexOf(quoteKey);
    if (dropIdx !== -1) {
      matches.push({ page, matchIndex: dropIdx, matchedKey: drop });
    } else {
      const keep = page.keepKey ?? buildSearchKey(page.text, "keep");
      const keepIdx = keep.key.indexOf(quoteKey);
      if (keepIdx !== -1) {
        matches.push({ page, matchIndex: keepIdx, matchedKey: keep });
      }
    }
  }

  if (matches.length === 0) {
    return { reason: "not_found" };
  }

  // If found on several pages prefer the page_hint page, else the earliest
  const preferred =
    matches.find((m) => m.page.page_number === pageHint) ?? matches[0];

  const foundPage = preferred.page;
  const kStart = preferred.matchIndex;
  const kEnd = kStart + quoteKey.length;

  const char_start = preferred.matchedKey.map[kStart];
  const lastElem = preferred.matchedKey.elements[kEnd - 1];
  const char_end = lastElem.origIndex + lastElem.origLength;
  const pageMismatch = pageHint !== foundPage.page_number;

  return {
    page_number: foundPage.page_number,
    char_start,
    char_end,
    pageMismatch,
  };
}

/**
 * Verifies raw extracted clauses against document pages.
 * Only verified clauses are accepted.
 * Rejects are counted and categorized.
 * Identical (type, page, start, end) clauses are deduplicated.
 */
export function verifyClauses(
  rawClauses: RawClause[],
  pages: Array<{ page_number: number; text: string }>,
): VerificationResult {
  const pageKeys: PageKeyData[] = pages.map((page) => {
    const dropKey = buildSearchKey(page.text, "drop");
    const keepKey = buildSearchKey(page.text, "keep");
    return {
      page_number: page.page_number,
      text: page.text,
      dropKey,
      keepKey,
      searchKey: dropKey,
    };
  });

  const pagesByNumber = new Map<number, { page_number: number; text: string }>();
  for (const p of pages) {
    pagesByNumber.set(p.page_number, p);
  }

  const accepted: VerifiedClause[] = [];
  const rejected: RejectedClause[] = [];
  const seenKeys = new Set<string>();

  for (const raw of rawClauses) {
    const findResult = findQuote(pageKeys, raw.quote, raw.page_hint);

    if ("reason" in findResult) {
      rejected.push({
        clause_type: raw.clause_type,
        reason: findResult.reason,
        quote_length: raw.quote.length,
      });
      continue;
    }

    const { page_number, char_start, char_end, pageMismatch } = findResult;
    const pageObj = pagesByNumber.get(page_number);
    const origSlice = pageObj ? pageObj.text.slice(char_start, char_end) : raw.quote;

    const dedupKey = `${raw.clause_type}:${page_number}:${char_start}:${char_end}`;
    if (seenKeys.has(dedupKey)) {
      continue;
    }
    seenKeys.add(dedupKey);

    accepted.push({
      clause_type: raw.clause_type,
      verbatim_text: origSlice,
      page_number,
      char_start,
      char_end,
      extraction_confidence: raw.confidence,
      page_mismatch: pageMismatch,
    });
  }

  return { accepted, rejected };
}

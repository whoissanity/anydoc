/** Text search over the PDF.js text layer. No network, no DOM, no worker. */

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  /** When false, accents and other combining marks are ignored. */
  diacritics: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  diacritics: true,
};

export interface SearchHit {
  pageIndex: number;
  matchIndex: number;
  match: string;
  before: string;
  after: string;
}

export interface SearchIndex {
  pages: string[];
}

interface TextContentPage {
  getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
}

interface SearchDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<TextContentPage>;
}

const PAGE_TEXT_TIMEOUT_MS = 2_000;
const SEARCH_BUDGET_MS = 10_000;
const MAX_HITS = 500;

function withTextTimeout<T>(promise: Promise<T>): Promise<T> {
  const pending = promise;
  pending.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Text extraction timed out")), PAGE_TEXT_TIMEOUT_MS);
  });
  return Promise.race([pending, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function normalizeSearchText(value: string, options: SearchOptions): string {
  let text = value.normalize("NFKC");
  if (!options.diacritics) {
    text = text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }
  if (!options.caseSensitive) text = text.toLocaleLowerCase();
  return text;
}

export function makeMatcher(query: string, options: SearchOptions): RegExp {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(body, options.caseSensitive ? "gu" : "giu");
}

/** Builds a per-page text index once; repeat searches reuse it without re-parsing. */
export async function buildSearchIndex(
  doc: SearchDocument,
  signal?: AbortSignal
): Promise<SearchIndex> {
  const pages: string[] = [];
  const startedAt = Date.now();
  const total = Math.max(0, Math.min(doc.numPages, 5_000));

  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (Date.now() - startedAt > SEARCH_BUDGET_MS) break;
    try {
      const page = await doc.getPage(pageNumber);
      const content = await withTextTimeout(page.getTextContent());
      pages.push(
        content.items
          .map((item) => ("str" in item && item.str ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 100_000)
      );
    } catch {
      pages.push("");
    }
  }

  return { pages };
}

export function findMatches(
  index: SearchIndex,
  query: string,
  options: SearchOptions
): SearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const matcher = makeMatcher(normalizeSearchText(trimmed, options), options);
  const hits: SearchHit[] = [];

  for (let pageIndex = 0; pageIndex < index.pages.length && hits.length < MAX_HITS; pageIndex += 1) {
    const raw = index.pages[pageIndex] ?? "";
    if (!raw) continue;
    const page = normalizeSearchText(raw, options);
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(page)) && hits.length < MAX_HITS) {
      const start = match.index;
      const end = start + match[0].length;
      hits.push({
        pageIndex,
        matchIndex: start,
        match: match[0],
        before: page.slice(Math.max(0, start - 42), start).replace(/^\s+/, ""),
        after: page.slice(end, end + 42).replace(/\s+$/, ""),
      });
      if (match[0].length === 0) matcher.lastIndex += 1;
    }
  }

  return hits;
}
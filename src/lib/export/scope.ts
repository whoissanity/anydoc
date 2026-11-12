import { describeRange, parsePageRange } from "@/lib/document/pages";

/** Which pages an export should contain. */
export type ExportScopeMode = "all" | "current" | "range";

export interface ExportScope {
  mode: ExportScopeMode;
  /** Raw range text such as "1-3, 5"; only read when mode is "range". */
  range: string;
}

export const DEFAULT_EXPORT_SCOPE: ExportScope = { mode: "all", range: "" };

export interface ResolvedExportScope {
  /** Zero-based page indices, or null for the whole document. */
  indices: number[] | null;
  /** Short summary shown beside the picker. */
  label: string;
  /** Set when the request cannot be honoured; the export must not run. */
  error?: string;
}

/** True when the subset is every page in order, so no copy is needed. */
export function isWholeDocument(indices: number[], pageCount: number): boolean {
  return indices.length === pageCount && indices.every((value, i) => value === i);
}

// parsePageRange defaults to all pages on bad input, so invalid ranges become errors.
export function resolveExportScope(
  scope: ExportScope,
  currentPage: number,
  pageCount: number
): ResolvedExportScope {
  if (pageCount <= 0) return { indices: null, label: "All pages" };

  if (scope.mode === "all") {
    return {
      indices: null,
      label: `All ${pageCount} page${pageCount === 1 ? "" : "s"}`,
    };
  }

  if (scope.mode === "current") {
    const index = Math.min(Math.max(currentPage, 1), pageCount) - 1;
    return { indices: [index], label: `Page ${index + 1}` };
  }

  const text = scope.range.trim();
  const empty = { indices: null, label: "No range" } as const;
  if (!text) {
    return { ...empty, error: "Enter a page range, for example 1-3" };
  }

  const numbers = text.match(/\d+/g);
  if (!numbers) {
    return { ...empty, error: "A page range needs page numbers, for example 1-3" };
  }

  const values = numbers.map(Number);
  if (values.some((value) => value < 1)) {
    return { ...empty, error: "Page numbers start at 1" };
  }

  const highest = Math.max(...values);
  if (highest > pageCount) {
    return {
      ...empty,
      error: `Page ${highest} is outside this ${pageCount}-page document`,
    };
  }

  const indices = parsePageRange(text, pageCount);
  if (!indices.length) {
    return { ...empty, error: "That range selects no pages" };
  }

  return {
    indices,
    label:
      indices.length === 1 ? `Page ${indices[0] + 1}` : `Pages ${describeRange(indices)}`,
  };
}

// Compact token ("-pages-2-4"); empty for whole-document so a partial export cannot overwrite one.
export function scopeFileSuffix(indices: number[] | null, pageCount: number): string {
  if (!indices || !indices.length || isWholeDocument(indices, pageCount)) return "";

  const pages = [...new Set(indices)]
    .sort((a, b) => a - b)
    .map((index) => index + 1);
  const groups: string[] = [];
  let start = pages[0];
  let previous = pages[0];

  for (const page of pages.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    groups.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }
  groups.push(start === previous ? `${start}` : `${start}-${previous}`);

  return pages.length === 1 ? `-page-${pages[0]}` : `-pages-${groups.join("_")}`;
}

/** Inserts a scope token before the extension: report.pdf -> report-pages-2-4.pdf */
export function addScopeToFilename(filename: string, suffix: string): string {
  if (!suffix) return filename;
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return `${filename}${suffix}`;
  return `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}`;
}

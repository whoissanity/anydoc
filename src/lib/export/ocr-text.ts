import type { OcrPage } from "@/lib/types";

/**
 * OCR text for a text-format export, keyed by exported page index.
 *
 * A redacted page is rebuilt as pixels, so it has no native text left and the
 * exporter would fall back to its OCR transcript. Passing those pages in
 * `redactedPages` drops exactly that transcript: otherwise the words burned out
 * of the page come back out of the export.
 */
export function ocrTextForExport(
  pages: readonly Pick<OcrPage, "pageIndex" | "text">[],
  exportedPages: readonly number[] | null,
  redactedPages: ReadonlySet<number> = new Set()
): Map<number, string> {
  const text = new Map<number, string>();
  for (const page of pages) {
    if (redactedPages.has(page.pageIndex)) continue;
    // A scoped export renumbers pages; -1 means the page is not in the export.
    const target = exportedPages ? exportedPages.indexOf(page.pageIndex) : page.pageIndex;
    if (target < 0) continue;
    text.set(target, page.text);
  }
  return text;
}

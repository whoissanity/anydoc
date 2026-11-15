/**
 * Editor-level resource budget.
 *
 * The parser already caps the file at 100 MB, but a 50 MB PDF can still declare
 * tens of thousands of pages. Mounting a canvas per page (or building a thumbnail
 * per page) is what turns an "enormous but valid" document into a tab crash, so
 * the editor refuses it at load time with a message the user can act on.
 */

export const MAX_EDITOR_BYTES = 100 * 1024 * 1024;
export const MAX_EDITOR_PAGES = 5_000;

export class DocumentBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentBudgetError";
  }
}

export function assertDocumentBudget(bytes: number, pageCount: number): void {
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    throw new DocumentBudgetError("This PDF has no readable pages.");
  }
  if (bytes > MAX_EDITOR_BYTES) {
    throw new DocumentBudgetError(
      `This PDF is larger than the ${Math.round(MAX_EDITOR_BYTES / (1024 * 1024))} MB editor limit.`
    );
  }
  if (pageCount > MAX_EDITOR_PAGES) {
    throw new DocumentBudgetError(
      `This PDF has ${pageCount.toLocaleString()} pages; the editor supports up to ${MAX_EDITOR_PAGES.toLocaleString()} pages per document. Split it and open the part you need.`
    );
  }
}
import { describe, expect, it } from "vitest";
import {
  assertDocumentBudget,
  DocumentBudgetError,
  MAX_EDITOR_BYTES,
  MAX_EDITOR_PAGES,
} from "@/lib/document/budget";

describe("assertDocumentBudget", () => {
  it("accepts a normal document", () => {
    expect(() => assertDocumentBudget(1_000_000, 1)).not.toThrow();
    expect(() => assertDocumentBudget(MAX_EDITOR_BYTES, MAX_EDITOR_PAGES)).not.toThrow();
  });

  it("rejects a document with too many pages and says how many it has", () => {
    try {
      assertDocumentBudget(1_000, MAX_EDITOR_PAGES + 1);
      throw new Error("expected a budget error");
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentBudgetError);
      expect((error as Error).message).toContain((MAX_EDITOR_PAGES + 1).toLocaleString());
      expect((error as Error).message).toContain(MAX_EDITOR_PAGES.toLocaleString());
    }
  });

  it("rejects a document over the byte cap", () => {
    expect(() => assertDocumentBudget(MAX_EDITOR_BYTES + 1, 1)).toThrow(DocumentBudgetError);
  });

  it("rejects an unreadable page count", () => {
    expect(() => assertDocumentBudget(1, 0)).toThrow(DocumentBudgetError);
    expect(() => assertDocumentBudget(1, Number.NaN)).toThrow(DocumentBudgetError);
  });
});
import { describe, expect, it } from "vitest";
import { addScopeToFilename, resolveExportScope, scopeFileSuffix } from "@/lib/export/scope";

describe("scopeFileSuffix", () => {
  it("marks nothing for a whole-document export", () => {
    expect(scopeFileSuffix(null, 3)).toBe("");
    expect(scopeFileSuffix([0, 1, 2], 3)).toBe("");
  });

  it("names a single page", () => {
    expect(scopeFileSuffix([1], 3)).toBe("-page-2");
  });

  it("collapses consecutive pages into a range", () => {
    expect(scopeFileSuffix([1, 2, 3], 5)).toBe("-pages-2-4");
    expect(scopeFileSuffix([0, 1], 3)).toBe("-pages-1-2");
  });

  it("joins separated runs with an underscore", () => {
    expect(scopeFileSuffix([0, 1, 2, 4], 5)).toBe("-pages-1-3_5");
    expect(scopeFileSuffix([0, 2, 4], 5)).toBe("-pages-1_3_5");
  });

  it("normalises order and duplicates so the name is deterministic", () => {
    expect(scopeFileSuffix([4, 0, 1, 1], 5)).toBe("-pages-1-2_5");
  });

  it("only emits characters safeDownloadName keeps", () => {
    const suffix = scopeFileSuffix([0, 2, 4], 5);
    expect(suffix).toMatch(/^[-\w]+$/);
  });
});

describe("addScopeToFilename", () => {
  it("inserts the token before the extension", () => {
    expect(addScopeToFilename("report.docx", "-pages-2-4")).toBe("report-pages-2-4.docx");
    expect(addScopeToFilename("report.pdf", "-page-2")).toBe("report-page-2.pdf");
  });

  it("keeps only the final extension when the name contains dots", () => {
    expect(addScopeToFilename("v1.2.report.pdf", "-page-2")).toBe("v1.2.report-page-2.pdf");
  });

  it("appends when there is no extension", () => {
    expect(addScopeToFilename("report", "-page-2")).toBe("report-page-2");
  });

  it("leaves full-document names untouched", () => {
    expect(addScopeToFilename("report.docx", "")).toBe("report.docx");
  });
});

describe("resolveExportScope feeds the filename", () => {
  it("reports the same pages that get exported", () => {
    const resolved = resolveExportScope({ mode: "range", range: "2" }, 1, 3);
    expect(resolved.indices).toEqual([1]);
    expect(scopeFileSuffix(resolved.indices, 3)).toBe("-page-2");
  });

  it("keeps full-document names for the all-pages mode", () => {
    const resolved = resolveExportScope({ mode: "all", range: "" }, 1, 3);
    expect(scopeFileSuffix(resolved.indices, 3)).toBe("");
  });
});

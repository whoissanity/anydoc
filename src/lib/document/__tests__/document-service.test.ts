import { beforeEach, describe, expect, it, vi } from "vitest";

// Parsing a real PDF needs PDF.js's worker and a DOM; the scope logic is independent, so only the parser is stubbed.
vi.mock("@/lib/document/load", () => ({
  loadPdfDocument: async () => ({ numPages: 3 }),
  extractOutline: async () => [],
  extractAttachments: async () => [],
  extractLayers: async () => [],
}));

import { openPdfBytes, reloadFromBytes } from "@/lib/document/document-service";
import { useEditorStore } from "@/store/editor-store";

// A valid PDF header, so the real content assertion in the service passes.
const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

const ALL_PAGES = { mode: "all" as const, range: "" };

beforeEach(() => {
  useEditorStore.setState({ exportScope: ALL_PAGES, fileName: null, pageCount: 0 });
});

describe("export scope across documents", () => {
  it("resets to all pages when a different document is opened", async () => {
    useEditorStore.setState({ exportScope: { mode: "range", range: "2" } });

    await openPdfBytes(bytes, "second.pdf");

    expect(useEditorStore.getState().exportScope).toEqual(ALL_PAGES);
    expect(useEditorStore.getState().fileName).toBe("second.pdf");
  });

  it("resets a single-page scope too", async () => {
    useEditorStore.setState({ exportScope: { mode: "current", range: "" } });

    await openPdfBytes(bytes, "another.pdf");

    expect(useEditorStore.getState().exportScope).toEqual(ALL_PAGES);
  });

  it("keeps the chosen scope when the same document is reloaded after an edit", async () => {
    useEditorStore.setState({ exportScope: { mode: "range", range: "2-3" }, fileName: "report.pdf" });

    await reloadFromBytes(bytes);

    expect(useEditorStore.getState().exportScope).toEqual({ mode: "range", range: "2-3" });
    expect(useEditorStore.getState().fileName).toBe("report.pdf");
  });

  it("treats a merge or create, which passes an explicit name, as a new document", async () => {
    useEditorStore.setState({ exportScope: { mode: "range", range: "1-2" } });

    await openPdfBytes(bytes, "merged.pdf");

    expect(useEditorStore.getState().exportScope).toEqual(ALL_PAGES);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Parsing a real PDF needs PDF.js's worker and a DOM; the scope logic is independent, so only the parser is stubbed.
vi.mock("@/lib/document/load", () => {
  class PdfPasswordRequiredError extends Error {
    code: 1 | 2;
    constructor(code: 1 | 2) {
      super(code === 2 ? "Incorrect password" : "Password required");
      this.code = code;
    }
  }
  return {
    loadPdfDocument: async () => ({ numPages: 3 }),
    extractOutline: async () => [],
    extractAttachments: async () => [],
    extractLayers: async () => [],
    PdfPasswordRequiredError,
  };
});
vi.mock("@localonlytools/pdf-decrypt", () => ({
  isEncrypted: vi.fn(async () => ({ encrypted: false })),
  decryptPDF: vi.fn(async (bytes: Uint8Array) => bytes),
}));

import { openPdfBytes, reloadFromBytes } from "@/lib/document/document-service";
import { PdfPasswordRequiredError } from "@/lib/document/load";
import { decryptPDF, isEncrypted } from "@localonlytools/pdf-decrypt";
import { useEditorStore } from "@/store/editor-store";

const isEncryptedMock = vi.mocked(isEncrypted);
const decryptPDFMock = vi.mocked(decryptPDF);

// A valid PDF header, so the real content assertion in the service passes.
const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const decrypted = new Uint8Array([...bytes, 0x0a, 0x64, 0x65, 0x63]);

const ALL_PAGES = { mode: "all" as const, range: "" };

beforeEach(() => {
  isEncryptedMock.mockResolvedValue({ encrypted: false });
  decryptPDFMock.mockImplementation(async (value: Uint8Array) => value);
  useEditorStore.setState({
    exportScope: ALL_PAGES,
    fileName: null,
    pageCount: 0,
    pdfBytes: null,
    pdfDecrypted: false,
  });
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

  it("keeps the user on their current page when reloading after an edit", async () => {
    // Regression: pressing Enter to save a text edit rebuilt the document and jumped back
    // to page 1. reloadFromBytes must preserve currentPage.
    useEditorStore.setState({ exportScope: ALL_PAGES, fileName: "report.pdf", currentPage: 3 });

    await reloadFromBytes(bytes);

    expect(useEditorStore.getState().currentPage).toBe(3);
  });

  it("clamps currentPage down if the reloaded document has fewer pages", async () => {
    useEditorStore.setState({ exportScope: ALL_PAGES, fileName: "report.pdf", currentPage: 99 });

    await reloadFromBytes(bytes);

    expect(useEditorStore.getState().currentPage).toBe(useEditorStore.getState().pageCount);
  });
});

describe("encrypted documents", () => {
  it("decrypts with the supplied password and marks the document decrypted", async () => {
    isEncryptedMock.mockResolvedValueOnce({ encrypted: true, algorithm: "AES-256" });
    decryptPDFMock.mockResolvedValueOnce(decrypted);

    await openPdfBytes(bytes, "secret.pdf", { password: "hunter2" });

    expect(decryptPDFMock).toHaveBeenCalledWith(bytes, "hunter2");
    expect(useEditorStore.getState().pdfBytes).toEqual(decrypted);
    expect(useEditorStore.getState().pdfDecrypted).toBe(true);
  });

  it("reports an incorrect password without loading the encrypted bytes", async () => {
    isEncryptedMock.mockResolvedValueOnce({ encrypted: true, algorithm: "AES-256" });
    decryptPDFMock.mockRejectedValueOnce(new Error("Incorrect password"));

    await expect(openPdfBytes(bytes, "secret.pdf", { password: "wrong" })).rejects.toMatchObject({
      code: 2,
    });
    expect(useEditorStore.getState().pdfBytes).toBeNull();
  });

  it("asks for a password when the document is encrypted and none was supplied", async () => {
    isEncryptedMock.mockResolvedValueOnce({ encrypted: true, algorithm: "AES-128" });
    decryptPDFMock.mockRejectedValueOnce(new Error("Incorrect password"));

    await expect(openPdfBytes(bytes, "secret.pdf")).rejects.toBeInstanceOf(
      PdfPasswordRequiredError
    );
  });
});

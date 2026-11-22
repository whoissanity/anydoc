import { describe, expect, it } from "vitest";
import { classifyBytes, importedPdfName } from "@/lib/document/import-routing";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

const PDF = text("%PDF-1.7\n");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);

describe("classifyBytes", () => {
  it("recognises a PDF by its header, whatever the name says", () => {
    expect(classifyBytes(PDF, "notes.txt")).toBe("pdf");
    expect(classifyBytes(PDF, "photo.png")).toBe("pdf");
  });

  it("recognises PNG and JPEG by signature, whatever the name says", () => {
    expect(classifyBytes(PNG, "report.pdf")).toBe("image");
    expect(classifyBytes(JPEG, "scan.pdf")).toBe("image");
  });

  it("routes HTML by extension", () => {
    expect(classifyBytes(text("<p>hi</p>"), "page.html")).toBe("html");
    expect(classifyBytes(text("<p>hi</p>"), "page.xhtml")).toBe("html");
  });

  it("routes extensionless markup by its leading tag", () => {
    expect(classifyBytes(text("<!doctype html><p>hi</p>"), "page")).toBe("html");
    expect(classifyBytes(text("<html><body>x</body></html>"), "")).toBe("html");
  });

  it("falls back to the document converter for everything else", () => {
    expect(classifyBytes(text("PK\u0003\u0004word"), "brief.docx")).toBe("document");
    expect(classifyBytes(text("Region,Total\nNorth,10"), "data.csv")).toBe("document");
    expect(classifyBytes(bytes(0xd0, 0xcf, 0x11, 0xe0), "legacy.doc")).toBe("document");
    expect(classifyBytes(bytes(0x00, 0x01, 0x02), "mystery.bin")).toBe("document");
  });

  it("does not mistake a PDF-looking name for PDF content", () => {
    expect(classifyBytes(text("just text"), "fake.pdf")).toBe("document");
  });
});

describe("importedPdfName", () => {
  it("keeps the stem and swaps the extension", () => {
    expect(importedPdfName("Quarterly.Report.docx")).toBe("Quarterly.Report.pdf");
    expect(importedPdfName("notes")).toBe("notes.pdf");
  });

  it("falls back for an empty name", () => {
    expect(importedPdfName("")).toBe("document.pdf");
    expect(importedPdfName(".hidden")).toBe("document.pdf");
  });
});

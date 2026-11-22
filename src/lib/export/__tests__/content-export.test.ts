import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { exportDocument } from "@/lib/export";
import { extractDocumentContent } from "@/lib/export/content";

// Pins real document text and OCR-only text through to the packaged OpenXML/ODF members.

async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 360;
  for (const line of lines) {
    page.drawText(line, { x: 30, y, size: 12, font });
    y -= 24;
  }
  doc.setTitle("Quarterly Report");
  return doc.save();
}

/** A one-page PDF whose page has no text layer (a scan stand-in). */
async function scannedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]);
  return doc.save();
}

async function zipMember(blob: Blob, member: string): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = zip.file(member);
  if (!file) throw new Error(`archive is missing ${member}`);
  return file.async("string");
}

describe("extractDocumentContent", () => {
  it("reads the document's real text into export lines", async () => {
    const content = await extractDocumentContent(
      await textPdf(["Hello real document content", "Second paragraph line"])
    );
    const flat = content.pages.flatMap((page) => page.lines.map((line) => line.text));
    expect(flat).toContain("Hello real document content");
    expect(flat).toContain("Second paragraph line");
  });

  it("falls back to stored OCR text for a page with no text layer", async () => {
    const content = await extractDocumentContent(
      await scannedPdf(),
      undefined,
      new Map([[0, "Scanned invoice total 42"]])
    );
    expect(content.pages[0].lines.map((line) => line.text)).toContain(
      "Scanned invoice total 42"
    );
  });

  it("does not borrow OCR text when the page already has real text", async () => {
    const content = await extractDocumentContent(
      await textPdf(["Printed heading"]),
      undefined,
      new Map([[0, "should not appear"]])
    );
    const flat = content.pages.flatMap((page) => page.lines.map((line) => line.text));
    expect(flat).toContain("Printed heading");
    expect(flat).not.toContain("should not appear");
  });
});

describe("WORD (docx) export", () => {
  it("writes the real document text into word/document.xml (w:p / w:r / w:t)", async () => {
    const { blob, filename } = await exportDocument(await textPdf(["Invoice number 123"]), "docx", {
      fileName: "report.pdf",
    });

    expect(filename.endsWith(".docx")).toBe(true);
    const xml = await zipMember(blob, "word/document.xml");
    expect(xml).toContain("<w:p");
    expect(xml).toContain("<w:t");
    expect(xml).toContain("Invoice number 123");
    expect(xml).toContain("Quarterly Report");
  });

  it("includes OCR text so a scanned document is not exported blank", async () => {
    const { blob } = await exportDocument(await scannedPdf(), "docx", {
      fileName: "scan.pdf",
      ocrText: new Map([[0, "Received from Ada on Tuesday"]]),
    });

    const xml = await zipMember(blob, "word/document.xml");
    expect(xml).toContain("Received from Ada on Tuesday");
  });
});

describe("OpenDocument (odt) export", () => {
  it("writes the real document text into content.xml text:p elements", async () => {
    const { blob, filename } = await exportDocument(
      await textPdf(["Payment terms net 30"]),
      "odt",
      { fileName: "report.pdf" }
    );

    expect(filename.endsWith(".odt")).toBe(true);
    const xml = await zipMember(blob, "content.xml");
    expect(xml).toContain("<text:p");
    expect(xml).toContain("Payment terms net 30");
  });

  it("includes OCR text so a scanned document is not exported blank", async () => {
    const { blob } = await exportDocument(await scannedPdf(), "odt", {
      fileName: "scan.pdf",
      ocrText: new Map([[0, "Received from Ada on Tuesday"]]),
    });

    const xml = await zipMember(blob, "content.xml");
    expect(xml).toContain("Received from Ada on Tuesday");
  });
});

describe("other formats carry the same text", () => {
  it("markdown falls back to OCR text", async () => {
    const { blob } = await exportDocument(await scannedPdf(), "md", {
      fileName: "scan.pdf",
      ocrText: new Map([[0, "Scanned paragraph text"]]),
    });
    expect(await blob.text()).toContain("Scanned paragraph text");
  });

  it("plain text export carries the real body text", async () => {
    const { blob } = await exportDocument(await textPdf(["Body text here"]), "txt", {
      fileName: "report.pdf",
    });
    expect(await blob.text()).toContain("Body text here");
  });
});

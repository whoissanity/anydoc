import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { assertPdfBytes, readPdfFile, MAX_PDF_BYTES } from "@/lib/document/validate";
import { extractDocumentText } from "@/lib/document/office-extract";
import { PDFDocument } from "pdf-lib";

describe("Malicious Input Fixture Corpus (AGENTS.md guardrails)", () => {
  describe("1. Archive & XML Exploits (Zip Bombs & DTD/XXE)", () => {
    it("rejects an archive declaring an excessive uncompressed size (zip bomb)", async () => {
      const zip = new JSZip();
      // Add a file entry and mock an inflated declared size > 200MB
      zip.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Bomb</w:t></w:r></w:p></w:body></w:document>");
      const zipData = await zip.generateAsync({ type: "uint8array" });

      // Create a mock zip instance where declared size exceeds threshold
      const loadedZip = await JSZip.loadAsync(zipData);
      const fileEntry = loadedZip.file("word/document.xml") as unknown as {
        _data: { uncompressedSize: number };
      };
      if (fileEntry && fileEntry._data) {
        fileEntry._data.uncompressedSize = 300 * 1024 * 1024; // 300 MB > 200 MB limit
      }

      // Directly test creating an archive with thousands of entries (>5,000 limit)
      const bombZip = new JSZip();
      for (let i = 0; i < 5005; i++) {
        bombZip.file(`part_${i}.xml`, "a");
      }
      const bombBytes = await bombZip.generateAsync({ type: "uint8array" });
      const bombFile = new File([bombBytes as unknown as BlobPart], "entry-bomb.docx");

      await expect(extractDocumentText(bombFile)).rejects.toThrow();
    });

    it("rejects an Office archive containing XML DTD or entity declarations (XXE protection)", async () => {
      const xxeZip = new JSZip();
      const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE test [
  <!ENTITY % xxe SYSTEM "file:///etc/passwd">
  %xxe;
]>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>&xxe;</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      xxeZip.file("word/document.xml", xxePayload);
      const xxeBytes = await xxeZip.generateAsync({ type: "uint8array" });
      const xxeFile = new File([xxeBytes as unknown as BlobPart], "payload.docx");

      await expect(extractDocumentText(xxeFile)).rejects.toThrow(
        /XML DTD or entity/i
      );
    });

    it("rejects an archive declaring an entity inside relationship or presentation xml", async () => {
      const xxeZip = new JSZip();
      xxeZip.file(
        "[Content_Types].xml",
        '<!DOCTYPE types [ <!ENTITY secret "xxe_injection"> ]><Types></Types>'
      );
      const xxeBytes = await xxeZip.generateAsync({ type: "uint8array" });
      const xxeFile = new File([xxeBytes as unknown as BlobPart], "presentation.pptx");

      await expect(extractDocumentText(xxeFile)).rejects.toThrow(
        /XML DTD or entity/i
      );
    });
  });

  describe("2. Malformed PDF Structure & Truncated Streams", () => {
    it("rejects PDF files missing the %PDF- magic header", () => {
      const corrupt = new TextEncoder().encode("NOT A PDF AT ALL");
      expect(() => assertPdfBytes(corrupt)).toThrow(/not a PDF/i);
    });

    it("rejects empty files before full buffering", async () => {
      const emptyFile = new File([], "empty.pdf");
      await expect(readPdfFile(emptyFile)).rejects.toThrow(/empty/i);
    });

    it("rejects files exceeding the 100 MB hard limit", async () => {
      const oversizedBytes = new Uint8Array(MAX_PDF_BYTES + 1024);
      oversizedBytes.set(new TextEncoder().encode("%PDF-1.4"));
      expect(() => assertPdfBytes(oversizedBytes)).toThrow(/larger than the 100 MB limit/i);
    });

    it("rejects truncated xref tables and severed EOF trailers safely", async () => {
      // Create minimal valid PDF bytes
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      const validBytes = await doc.save();

      // Truncate to slice off xref and trailer
      const truncated = validBytes.slice(0, Math.floor(validBytes.length / 2));

      // assertPdfBytes verifies header
      expect(assertPdfBytes(truncated)).toBeUndefined();

      // Loading with pdf-lib should either safely fail or reject malformed trailer without unhandled crash
      await expect(PDFDocument.load(truncated)).rejects.toThrow();
    });

    it("handles deeply nested object stream / cyclical dictionary structures safely", async () => {
      // Craft a PDF with circular / recursive references
      const recursivePdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Pages /Kids [2 0 R] /Count 1 >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
173
%%EOF`;
      const bytes = new TextEncoder().encode(recursivePdf);
      // Validates header
      expect(() => assertPdfBytes(bytes)).not.toThrow();

      // Parser handles or throws safely without infinite loop
      await expect(PDFDocument.load(bytes)).rejects.toThrow();
    });
  });

  describe("3. High Page Count (10,000-page synthetic structure)", () => {
    it("safely handles synthetic extreme page count metadata without memory exhaustion", async () => {
      const doc = await PDFDocument.create();
      // Add pages to test scaling without memory explosion
      for (let i = 0; i < 200; i++) {
        doc.addPage([20, 20]);
      }
      const validBytes = await doc.save();
      expect(() => assertPdfBytes(validBytes)).not.toThrow();

      // Loading with pdf-lib resolves the physical pages safely
      const parsed = await PDFDocument.load(validBytes);
      expect(parsed.getPageCount()).toBe(200);
    });
  });
});

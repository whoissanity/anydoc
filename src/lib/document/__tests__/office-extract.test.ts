import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  describeContentMismatch,
  extractDocumentText,
  htmlDocumentText,
} from "@/lib/document/office-extract";

// mammoth's browser build (which the app bundles) takes an ArrayBuffer; Vitest loads the
// Node build here, so stub the module to keep this a deterministic unit test.
vi.mock("mammoth", () => ({
  default: {
    extractRawText: async () => ({ value: "Imported from Word: contract summary.", messages: [] }),
  },
}));

const bytes = (...values: number[]) => new Uint8Array(values);

async function makeDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Imported from Word: contract summary.</w:t></w:r></w:p></w:body></w:document>`
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("describeContentMismatch", () => {
  it("rejects a .docx whose bytes are not a ZIP archive", () => {
    expect(describeContentMismatch(".docx", new TextEncoder().encode("plain text"))).toContain(
      "not a valid Office/OpenDocument archive"
    );
  });

  it("accepts a real ZIP archive for .docx", () => {
    expect(describeContentMismatch(".docx", bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
  });

  it("accepts OLE and RTF for legacy .doc but rejects other bytes", () => {
    expect(describeContentMismatch(".doc", bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBeNull();
    expect(describeContentMismatch(".doc", new TextEncoder().encode("{\\rtf1"))).toBeNull();
    expect(describeContentMismatch(".doc", bytes(0x00, 0x01))).toContain("not a valid legacy document");
  });

  it("rejects a .rtf that is not RTF content", () => {
    expect(describeContentMismatch(".rtf", new TextEncoder().encode("hello"))).toContain(
      "does not contain RTF content"
    );
  });
});

describe("htmlDocumentText", () => {
  it("strips scripts and decodes entities into PDF-ready text", () => {
    const text = htmlDocumentText("<h1>Title</h1><p>a &amp; b &lt;c&gt; &#8212; d</p><script>alert(1)</script>");
    expect(text).toContain("Title");
    expect(text).toContain("a & b <c> — d");
    expect(text).not.toContain("alert");
  });

  it("rejects HTML beyond the input cap", () => {
    expect(() => htmlDocumentText("x".repeat(2_000_001))).toThrow("too large");
  });
});

describe("extractDocumentText", () => {
  it("routes a .docx through the extractor and returns its text", async () => {
    const file = new File([await makeDocx()], "brief.docx");
    await expect(extractDocumentText(file)).resolves.toContain("contract summary");
  });

  it("extracts text from a real .odt archive", async () => {
    const zip = new JSZip();
    zip.file(
      "content.xml",
      `<?xml version="1.0"?><office:document-content xmlns:office="u" xmlns:text="t"><office:body><office:text><text:h text:outline-level="1">Report</text:h><text:p>Quarterly <text:s/>results</text:p></office:text></office:body></office:document-content>`
    );
    const file = new File([await zip.generateAsync({ type: "arraybuffer" })], "report.odt");
    const text = await extractDocumentText(file);
    expect(text).toContain("# Report");
    expect(text).toContain("Quarterly");
  });

  it("passes plain text through", async () => {
    const file = new File(["Region,Total\nNorth,10"], "notes.txt");
    await expect(extractDocumentText(file)).resolves.toContain("Region,Total");
  });

  it("rejects an empty file", async () => {
    await expect(extractDocumentText(new File([], "empty.docx"))).rejects.toThrow("empty");
  });

  it("rejects a mislabelled Office file by content", async () => {
    const file = new File(["plain text, not a zip"], "fake.docx");
    await expect(extractDocumentText(file)).rejects.toThrow("not a valid Office/OpenDocument archive");
  });

  it("rejects an archive that declares an XML DTD", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<!DOCTYPE x [<!ENTITY e "x">]><Types/>`);
    zip.file("word/document.xml", `<w:document><w:p/></w:document>`);
    const file = new File([await zip.generateAsync({ type: "arraybuffer" })], "evil.docx");
    await expect(extractDocumentText(file)).rejects.toThrow("XML DTD or entity");
  });
});

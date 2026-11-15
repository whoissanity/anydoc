import { describe, expect, it } from "vitest";
import { PDFDocument, PDFDict, PDFHexString, PDFName } from "pdf-lib";
import { exportCommentsToFdf, importCommentsFromFdf, writeCommentsToPdf } from "@/lib/security/pdf-security";
import type { CommentThread } from "@/lib/security/pdf-security";
import { extractComments } from "@/lib/document/load";

function comment(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: "c1",
    pageIndex: 0,
    author: "Ada",
    date: "2026-01-01T00:00:00.000Z",
    text: "Please review",
    type: "sticky",
    status: "Open",
    replies: [],
    ...overrides,
  };
}

async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

describe("comment write/read round-trip", () => {
  it("writes review threads as PDF text notes and reads them back", async () => {
    const base = await blankPdf();
    const original = comment({ replies: [{ author: "Bob", text: "Agreed", date: "2026-01-02" }] });
    const written = await writeCommentsToPdf(base, [original]);

    const doc = await PDFDocument.load(written);
    const annots = doc.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
    const annotation = annots!.lookup(0, PDFDict);
    expect(annotation.get(PDFName.of("Subtype"))?.toString()).toBe("/Text");
    const contents = annotation.get(PDFName.of("Contents"));
    expect(contents).toBeInstanceOf(PDFHexString);
    const text = (contents as PDFHexString).decodeText();
    expect(text).toContain("Please review");
    expect(text).toContain("anydoc-reply");

    const fake = {
      numPages: 1,
      getPage: async () => ({
        getAnnotations: async () => [
          {
            id: "pdf-1",
            annotationType: 1,
            contentsObj: { str: text },
            titleObj: { str: "Ada" },
            date: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    };
    const read = await extractComments(fake);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({
      id: "pdf-1",
      pageIndex: 0,
      author: "Ada",
      text: "Please review",
      type: "sticky",
      status: "Open",
      replies: [{ author: "Bob", text: "Agreed", date: "2026-01-02" }],
    });
  });

  it("stops at the thread cap instead of scanning an enormous document", async () => {
    const fake = {
      numPages: 2_500,
      getPage: async (pageNumber: number) => ({
        getAnnotations: async () => [
          {
            id: `p-${pageNumber}`,
            annotationType: 1,
            contentsObj: { str: `note ${pageNumber}` },
            titleObj: { str: "Ada" },
            date: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    };
    const read = await extractComments(fake);
    expect(read.length).toBe(2_000);
  });

  it("exports to XFDF and imports without duplicating existing threads", () => {
    const thread = comment({ replies: [{ author: "Bob", text: "Agreed", date: "2026-01-02" }] });
    const xml = exportCommentsToFdf([thread], "review.pdf");
    const once = importCommentsFromFdf(xml, []);
    const twice = importCommentsFromFdf(xml, once);

    expect(once).toHaveLength(1);
    expect(once[0]).toMatchObject({
      id: "c1",
      pageIndex: 0,
      author: "Ada",
      text: "Please review",
      replies: [{ author: "Bob", text: "Agreed", date: "2026-01-02" }],
    });
    expect(twice).toHaveLength(1);
  });
});
import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { analyzeDocumentHealth } from "@/lib/inspect/health";

async function pdfBytes(configure?: (doc: PDFDocument) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  configure?.(doc);
  return doc.save();
}

describe("analyzeDocumentHealth", () => {
  it("returns a bounded score, grade and category breakdown", async () => {
    const health = await analyzeDocumentHealth(await pdfBytes());

    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D", "F"]).toContain(health.grade);
    expect(health.categories.map((category) => category.id)).toEqual([
      "structure",
      "metadata",
      "security",
      "content",
      "size",
    ]);
    expect(health.pageCount).toBe(1);
  });

  it("flags missing metadata", async () => {
    const health = await analyzeDocumentHealth(
      await pdfBytes((doc) => {
        doc.setTitle("");
        doc.setAuthor("");
        doc.setSubject("");
        doc.setCreator("");
        doc.setProducer("");
      })
    );

    const ids = health.issues.map((item) => item.id);
    expect(ids).toContain("metadata.title");
    expect(ids).toContain("metadata.author");
    expect(ids).toContain("metadata.subject");
  });

  it("flags JavaScript and automatic actions as critical", async () => {
    const health = await analyzeDocumentHealth(
      await pdfBytes((doc) => {
        doc.catalog.set(PDFName.of("OpenAction"), PDFName.of("Something"));
      })
    );

    const issue = health.issues.find((item) => item.id === "security.actions");
    expect(issue).toMatchObject({ severity: "critical", category: "security" });
    expect(health.score).toBeLessThan(100);
  });

  it("returns a zero score for an unreadable PDF", async () => {
    const health = await analyzeDocumentHealth(
      new TextEncoder().encode("%PDF-1.7\nthis is not a real document")
    );

    expect(health.score).toBe(0);
    expect(health.grade).toBe("F");
    expect(health.issues[0]?.id).toBe("structure.unreadable");
  });

  it("rejects an empty buffer before parsing", async () => {
    await expect(analyzeDocumentHealth(new Uint8Array(0))).rejects.toThrow(/empty or detached/);
  });
});
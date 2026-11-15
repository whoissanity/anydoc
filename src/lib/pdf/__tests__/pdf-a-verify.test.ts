import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { preparePdfA } from "@/lib/pdf/pdf-a";
import { verifyPdfA } from "@/lib/pdf/pdf-a-verify";

async function basePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Archival test");
  doc.setAuthor("AnyDoc");
  doc.addPage([300, 200]);
  return doc.save();
}

describe("verifyPdfA", () => {
  it("passes a prepared document", async () => {
    const prepared = await preparePdfA(await basePdf(), { stripJavaScript: true });
    const result = await verifyPdfA(prepared.bytes);

    expect(result.ok).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks.find((check) => check.id === "outputIntent")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "xmp")?.status).toBe("pass");
  });

  it("fails an unprepared document on output intent and XMP", async () => {
    const result = await verifyPdfA(await basePdf());

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === "outputIntent")?.status).toBe("fail");
    expect(result.checks.find((check) => check.id === "xmp")?.status).toBe("fail");
  });

  it("fails when JavaScript remains", async () => {
    const doc = await PDFDocument.load(await basePdf());
    doc.catalog.set(PDFName.of("OpenAction"), doc.context.obj({ Type: "Action", S: "JavaScript" }));
    const prepared = await preparePdfA(await doc.save(), { stripJavaScript: false });

    const result = await verifyPdfA(prepared.bytes);
    expect(result.checks.find((check) => check.id === "scripts")?.status).toBe("fail");
    expect(result.ok).toBe(false);
  });

  it("rejects empty input", async () => {
    await expect(verifyPdfA(new Uint8Array(0))).rejects.toThrow(/empty or detached/);
  });
});
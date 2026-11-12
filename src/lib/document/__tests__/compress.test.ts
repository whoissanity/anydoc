import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { compressPdf } from "@/lib/document/optimize";
import { getTool, type ToolContext } from "@/lib/tools/catalog";

/** Regression coverage: a rebuild that grew the file was returned as success; the size guard must return the original bytes. */

async function textPdf(useObjectStreams: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([300, 300]);
    page.drawText("Repeated hello world content ".repeat(10), { x: 20, y: 200, size: 11, font });
  }
  // Object-stream packed would inflate on re-save; classic xref rebuilds smaller.
  return doc.save({ useObjectStreams });
}

const opts = { mode: "lossless", dpi: 150, quality: 0.7, grayscale: false } as const;

function context(bytes: Uint8Array): ToolContext {
  return {
    bytes,
    fileName: "document.pdf",
    pageCount: 3,
    currentPage: 1,
    outline: [],
    onProgress: () => {},
  };
}

describe("compressPdf size guard", () => {
  it("falls back to the original bytes when a rebuild would inflate the file", async () => {
    const original = await textPdf(true);
    const result = await compressPdf(original, opts);

    expect(result.reduced).toBe(false);
    expect(result.after).toBe(result.before);
    expect(result.before).toBe(original.byteLength);
    // The attempted rebuild was not smaller, so it was discarded.
    expect(result.attempted).toBeGreaterThanOrEqual(result.before);
    // The exact original bytes are returned — never a bloated file.
    expect(Buffer.compare(Buffer.from(result.bytes), Buffer.from(original))).toBe(0);
  });

  it("keeps the smaller rebuild when compression genuinely helps", async () => {
    const original = await textPdf(false);
    const result = await compressPdf(original, opts);

    expect(result.reduced).toBe(true);
    expect(result.after).toBeLessThan(result.before);
    expect(result.after).toBe(result.attempted);
    expect(result.bytes.byteLength).toBe(result.after);
  });

  it("never returns a file larger than the input", async () => {
    for (const useObjectStreams of [true, false]) {
      const original = await textPdf(useObjectStreams);
      const result = await compressPdf(original, opts);
      expect(result.after).toBeLessThanOrEqual(result.before);
      expect(result.bytes.byteLength).toBe(result.after);
    }
  });
});

describe("compress tool reporting", () => {
  it("reports a warn state and no fake savings when it cannot shrink", async () => {
    const tool = getTool("compress")!;
    const outcome = await tool.run!(context(await textPdf(true)), { mode: "lossless" });

    expect(outcome.status).toBe("warn");
    expect(outcome.message).toMatch(/could not be reduced/i);
    expect(outcome.bytes).toBeUndefined();
    expect(outcome.report?.stats?.find((s) => s.label === "Change")?.value).toBe(
      "None — original kept"
    );
    expect(outcome.report?.note).toMatch(/already tightly compressed|larger than the original/i);
  });

  it("reports a success state with the real saving when it shrinks", async () => {
    const original = await textPdf(false);
    const tool = getTool("compress")!;
    const outcome = await tool.run!(context(original), { mode: "lossless" });

    expect(outcome.status).toBe("success");
    expect(outcome.message).toMatch(/reduced by/i);
    expect(outcome.bytes?.byteLength).toBeLessThan(original.byteLength);
    expect(outcome.report?.stats?.find((s) => s.label === "Saved")?.tone).toBe("good");
  });
});

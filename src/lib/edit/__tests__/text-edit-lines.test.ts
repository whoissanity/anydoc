// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { applyTextEdit } from "@/lib/edit/edit-engine";
import type { TextEditSession } from "@/lib/types";

async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

async function textRuns(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item)
    .filter((item) => item.str.trim().length > 0);
}

const LINES = [
  "First line of the paragraph",
  "second line continues here",
  "third line closes it.",
];

function session(): TextEditSession {
  return {
    id: "session-1",
    pageIndex: 0,
    text: LINES.join("\n"),
    x: 72,
    y: 792 - 700 - 12,
    width: 180,
    height: 42,
    fontSize: 12,
    fontFamily: "Helvetica, Arial, sans-serif",
    color: "#111111",
    lineHeight: 14 / 12,
    preserveLines: true,
    eraseUnderlay: true,
  };
}

describe("baking an existing text block", () => {
  it("draws one run per source line at the source leading", async () => {
    const output = await applyTextEdit(await blankPdf(), session());
    const runs = await textRuns(output);

    expect(runs.map((run) => run.str)).toEqual(LINES);
    const baselines = runs.map((run) => run.transform[5]);
    expect(baselines[0] - baselines[1]).toBeCloseTo(14, 1);
    expect(baselines[1] - baselines[2]).toBeCloseTo(14, 1);
    expect(new Set(runs.map((run) => run.transform[4]))).toEqual(new Set([72]));
  });

  it("wraps text boxes that are not preserving source lines", async () => {
    const output = await applyTextEdit(await blankPdf(), {
      ...session(),
      text: "A long sentence that must wrap inside a deliberately narrow text box.",
      width: 90,
      preserveLines: false,
    });
    const runs = await textRuns(output);
    expect(runs.length).toBeGreaterThan(1);
    // Wrapped lines still advance by exactly one leading each, never collapsing.
    const baselines = runs.map((run) => run.transform[5]);
    for (let i = 1; i < baselines.length; i += 1) {
      expect(baselines[i - 1] - baselines[i]).toBeCloseTo(14, 1);
    }
  });
});

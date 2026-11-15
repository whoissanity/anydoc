import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { bakePendingEdits } from "@/lib/edit/bake";

type Snapshot = Parameters<typeof bakePendingEdits>[1];

async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

describe("bakePendingEdits", () => {
  it("burns highlight overlays into the page without mutating the store", async () => {
    const base = await blankPdf();
    const state = {
      images: [],
      annotations: [
        {
          id: "a1",
          type: "highlight",
          pageIndex: 0,
          color: "#ffeb3b",
          rects: [{ x: 50, y: 600, width: 120, height: 18 }],
        },
      ],
      stickyNotes: [],
      textObjects: [],
      formFields: [],
      comments: [],
      redactions: [],
      bates: { enabled: false },
      markupOpacity: 1,
      dirty: true,
    } as unknown as Snapshot;

    const baked = await bakePendingEdits(base, state);
    expect(baked).not.toBe(base);
    expect(baked.length).toBeGreaterThan(base.length);

    await PDFDocument.load(baked);
    // The caller's overlay array is not consumed or mutated.
    expect(state.annotations).toHaveLength(1);
  });
});
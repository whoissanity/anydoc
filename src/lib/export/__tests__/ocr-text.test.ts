import { describe, expect, it } from "vitest";
import { ocrTextForExport } from "@/lib/export/ocr-text";

const pages = [
  { pageIndex: 0, text: "burned secret" },
  { pageIndex: 1, text: "kept paragraph" },
  { pageIndex: 2, text: "outside scope" },
];

describe("ocrTextForExport", () => {
  it("passes OCR text through for a whole-document export", () => {
    const text = ocrTextForExport(pages, null);
    expect([...text.entries()]).toEqual([
      [0, "burned secret"],
      [1, "kept paragraph"],
      [2, "outside scope"],
    ]);
  });

  it("never exports the transcript of a redacted page", () => {
    const text = ocrTextForExport(pages, null, new Set([0]));
    expect(text.has(0)).toBe(false);
    expect(text.get(1)).toBe("kept paragraph");
  });

  it("remaps page indices for a scoped export and skips pages outside it", () => {
    const text = ocrTextForExport(pages, [1, 2], new Set([0]));
    expect([...text.entries()]).toEqual([
      [0, "kept paragraph"],
      [1, "outside scope"],
    ]);
  });

  it("drops a redacted page even when it is inside the scope", () => {
    const text = ocrTextForExport(pages, [0, 1], new Set([0]));
    expect(text.has(0)).toBe(false);
    expect(text.get(1)).toBe("kept paragraph");
  });
});

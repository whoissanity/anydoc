import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { multiplyMatrix, unitSquareToBox, type Matrix } from "@/lib/edit/image-objects";
import { applyImageEdits, imageNeedsBake } from "@/lib/edit/edit-engine";
import type { ImageObject } from "@/lib/types";

// 1×1 opaque red PNG.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

describe("unitSquareToBox", () => {
  it("maps the unit square onto the page with a bottom-left origin", () => {
    // 100×50 image placed at (10, 20) from the PDF origin.
    const m: Matrix = [100, 0, 0, 50, 10, 20];
    const box = unitSquareToBox(m, 792);
    expect(box.x).toBe(10);
    expect(box.y).toBe(792 - 70);
    expect(box.width).toBe(100);
    expect(box.height).toBe(50);
    expect(box.rotation).toBe(0);
  });

  it("reads rotation from the matrix", () => {
    expect(unitSquareToBox([0, 1, -1, 0, 0, 0], 100).rotation).toBe(90);
  });

  it("normalises a mirrored matrix to a positive box", () => {
    const box = unitSquareToBox([-40, 0, 0, 20, 100, 10], 200);
    expect(box.x).toBe(60);
    expect(box.width).toBe(40);
    expect(box.height).toBe(20);
  });
});

describe("multiplyMatrix", () => {
  it("leaves a matrix unchanged when composed with the identity", () => {
    const m: Matrix = [2, 0, 0, 3, 5, 7];
    expect(multiplyMatrix(m, IDENTITY)).toEqual(m);
    expect(multiplyMatrix(IDENTITY, m)).toEqual(m);
  });

  it("composes translate then scale as a single affine transform", () => {
    const scale: Matrix = [2, 0, 0, 2, 0, 0];
    const translate: Matrix = [1, 0, 0, 1, 10, 20];
    // translate ∘ scale: point (1,1) -> (2,2) -> (12,22)
    const composed = multiplyMatrix(translate, scale);
    const box = unitSquareToBox(composed, 30);
    expect(box.x).toBe(10);
    expect(box.y).toBe(30 - 22);
    expect(box.width).toBe(2);
    expect(box.height).toBe(2);
  });
});

const image = (overrides: Partial<ImageObject> = {}): ImageObject => ({
  id: "img-1",
  pageIndex: 0,
  x: 10,
  y: 10,
  width: 20,
  height: 20,
  rotation: 0,
  dataUrl: PNG_DATA_URL,
  original: { x: 10, y: 10, width: 20, height: 20 },
  ...overrides,
});

async function basePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const png = await doc.embedPng(
    Uint8Array.from(atob(PNG_DATA_URL.split(",")[1]), (c) => c.charCodeAt(0))
  );
  page.drawImage(png, { x: 100, y: 100, width: 40, height: 40 });
  return doc.save();
}

describe("imageNeedsBake", () => {
  it("is false for an untouched image", () => {
    expect(imageNeedsBake(image())).toBe(false);
  });

  it("is true for moved, resized, replaced and removed images", () => {
    expect(imageNeedsBake(image({ x: 40 }))).toBe(true);
    expect(imageNeedsBake(image({ width: 25 }))).toBe(true);
    expect(imageNeedsBake(image({ replaced: true }))).toBe(true);
    expect(imageNeedsBake(image({ removed: true }))).toBe(true);
  });

  it("ignores sub-pixel drift", () => {
    expect(imageNeedsBake(image({ x: 10.001 }))).toBe(false);
  });
});

describe("applyImageEdits", () => {
  it("returns the bytes untouched when nothing changed", async () => {
    const bytes = await basePdf();
    await expect(applyImageEdits(bytes, [image()])).resolves.toBe(bytes);
  });

  it("bakes a moved image into the page content", async () => {
    const bytes = await basePdf();
    const baked = await applyImageEdits(bytes, [
      image({ x: 150, y: 150, width: 40, height: 40 }),
    ]);

    expect(baked).not.toBe(bytes);
    const doc = await PDFDocument.load(baked);
    expect(doc.getPageCount()).toBe(1);
    // The rewritten page carries a new image XObject beyond the original.
    expect(baked.byteLength).toBeGreaterThan(bytes.byteLength);
  });

  it("bakes a deletion without leaving the image in place", async () => {
    const bytes = await basePdf();
    const baked = await applyImageEdits(bytes, [image({ removed: true })]);

    const doc = await PDFDocument.load(baked);
    expect(doc.getPageCount()).toBe(1);
    expect(baked.byteLength).not.toBe(bytes.byteLength);
  });

  it("re-embeds replacement pixels", async () => {
    const bytes = await basePdf();
    const baked = await applyImageEdits(bytes, [image({ replaced: true, width: 60, height: 60 })]);

    const doc = await PDFDocument.load(baked);
    expect(doc.getPage(0).getSize().width).toBe(300);
    expect(baked.byteLength).toBeGreaterThan(bytes.byteLength);
  });
});

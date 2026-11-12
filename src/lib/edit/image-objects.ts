"use client";

import type { ImageObject } from "@/lib/types";
import { getPdfjs } from "@/lib/document/load";
import { loadRasterDoc } from "@/lib/document/raster";
import { withRenderLock } from "@/lib/document/render-queue";

/** Finds the raster images a PDF paints, with each box, by replaying the operator list and capturing PNG pixels. */

export type Matrix = [number, number, number, number, number, number];

/** a ∘ b, i.e. apply b first, then a. */
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export interface ImageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Maps the unit square (the image's own space) through `m` onto a page box. */
export function unitSquareToBox(m: Matrix, pageHeight: number): ImageBox {
  const corners: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]);

  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const degrees = Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI);

  return {
    x: minX,
    y: pageHeight - maxY,
    width: maxX - minX,
    height: maxY - minY,
    // /Rotate on the page and flipped matrices are deliberately not folded in; the overlay is drawn in unrotated page space.
    rotation: Math.abs(degrees) === 180 ? 0 : degrees,
  };
}

/** Crops an image's box from the rendered page; anything painted over it comes along, but it always yields pixels. */
function cropImage(pageCanvas: HTMLCanvasElement, box: ImageBox, factor: number): string | undefined {
  const width = Math.max(1, Math.round(box.width * factor));
  const height = Math.max(1, Math.round(box.height * factor));
  if (width < 8 || height < 8) return undefined;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(
    pageCanvas,
    Math.round(box.x * factor),
    Math.round(box.y * factor),
    width,
    height,
    0,
    0,
    width,
    height
  );
  return canvas.toDataURL("image/png");
}

/** Default cap: enough to edit a document page without decoding every asset. */
const MAX_IMAGES = 60;
/** Page raster resolution used to lift each image's pixels. */
const RASTER_SCALE = 2;

export async function extractPlacedImages(
  bytes: Uint8Array,
  maxImages = MAX_IMAGES
): Promise<ImageObject[]> {
  const doc = await loadRasterDoc(bytes);
  const pdfjs = (await getPdfjs()) as unknown as { OPS?: Record<string, number> };
  const ops = pdfjs.OPS ?? {};
  const SAVE = ops.save ?? 10;
  const RESTORE = ops.restore ?? 11;
  const TRANSFORM = ops.transform ?? 12;
  const PAINT = new Set([ops.paintImageXObject ?? 85, ops.paintJpegXObject ?? 82]);
  const INLINE = ops.paintInlineImageXObject ?? 86;

  const found: ImageObject[] = [];

  try {
    for (let p = 1; p <= doc.numPages && found.length < maxImages; p++) {
      const page = await doc.getPage(p);
      const { height } = page.getViewport({ scale: 1 });
      // Rendered before the operator list is requested: pdf.js can stall a render queued behind an
      // operator-list request on the same page proxy.
      let pageCanvas: HTMLCanvasElement | null = null;
      const renderPage = async () => {
        if (pageCanvas) return pageCanvas;
        const viewport = page.getViewport({ scale: RASTER_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Could not create a canvas for image extraction");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await withRenderLock(() => page.render({ canvasContext: ctx, viewport }).promise);
        pageCanvas = canvas;
        return canvas;
      };

      await renderPage();
      const list = await page.getOperatorList();
      let ctm: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];

      for (let i = 0; i < list.fnArray.length && found.length < maxImages; i++) {
        const fn = list.fnArray[i];
        const args = list.argsArray[i] as unknown[];

        if (fn === SAVE) {
          stack.push([...ctm] as Matrix);
          continue;
        }
        if (fn === RESTORE) {
          ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
          continue;
        }
        if (fn === TRANSFORM && Array.isArray(args) && args.length >= 6) {
          ctm = multiplyMatrix(ctm, args.slice(0, 6) as Matrix);
          continue;
        }

        if (!PAINT.has(fn) && fn !== INLINE) continue;
        if (PAINT.has(fn) && !String(args?.[0] ?? "")) continue;

        const box = unitSquareToBox(ctm, height);
        if (box.width < 4 || box.height < 4) continue;

        const dataUrl = cropImage(await renderPage(), box, RASTER_SCALE);
        // Without pixels there is nothing to move or replace, so the image is left alone rather than erased.
        if (!dataUrl) continue;

        found.push({
          id: `img-${p}-${found.length}`,
          pageIndex: p - 1,
          ...box,
          dataUrl,
          original: { x: box.x, y: box.y, width: box.width, height: box.height },
        });
      }
    }
  } finally {
    await doc.destroy();
  }

  return found;
}

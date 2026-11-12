"use client";

import { loadRasterDoc, renderRasterPage } from "@/lib/document/raster";

export interface ComparedPage {
  pageIndex: number;
  /** Fraction of pixels that differ, 0..1 */
  change: number;
  left?: string;
  right?: string;
  overlay?: string;
}

export interface CompareResult {
  pages: ComparedPage[];
  changedPages: number;
  totalPages: number;
  leftPages: number;
  rightPages: number;
}

const MAX_PREVIEWS = 14;

function drawScaled(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / source.width, height / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
}

/** Renders two documents page-by-page and reports which pages actually changed. */
export async function comparePdfs(
  leftBytes: Uint8Array,
  rightBytes: Uint8Array,
  onProgress?: (msg: string) => void
): Promise<CompareResult> {
  const left = await loadRasterDoc(leftBytes);
  const right = await loadRasterDoc(rightBytes);
  const total = Math.max(left.numPages, right.numPages);
  const pages: ComparedPage[] = [];
  let changedPages = 0;

  for (let i = 0; i < total; i++) {
    onProgress?.(`Comparing page ${i + 1} of ${total}…`);

    const leftCanvas = i < left.numPages ? await renderRasterPage(left, i + 1, 0.85) : null;
    const rightCanvas = i < right.numPages ? await renderRasterPage(right, i + 1, 0.85) : null;

    const width = Math.min(
      1000,
      Math.max(leftCanvas?.width ?? 612, rightCanvas?.width ?? 612)
    );
    const height = Math.min(
      1400,
      Math.max(leftCanvas?.height ?? 792, rightCanvas?.height ?? 792)
    );

    const a = document.createElement("canvas");
    a.width = width;
    a.height = height;
    const actx = a.getContext("2d", { willReadFrequently: true });
    if (!actx) continue;
    if (leftCanvas) drawScaled(actx, leftCanvas, width, height);

    const b = document.createElement("canvas");
    b.width = width;
    b.height = height;
    const bctx = b.getContext("2d", { willReadFrequently: true });
    if (!bctx) continue;
    if (rightCanvas) drawScaled(bctx, rightCanvas, width, height);

    const aData = actx.getImageData(0, 0, width, height);
    const bData = bctx.getImageData(0, 0, width, height);
    let changed = 0;
    const totalPx = width * height;

    const overlay = document.createElement("canvas");
    overlay.width = width;
    overlay.height = height;
    const octx = overlay.getContext("2d");
    const overlayData = octx?.createImageData(width, height);

    for (let p = 0; p < totalPx; p++) {
      const i4 = p * 4;
      const delta =
        Math.abs(aData.data[i4] - bData.data[i4]) +
        Math.abs(aData.data[i4 + 1] - bData.data[i4 + 1]) +
        Math.abs(aData.data[i4 + 2] - bData.data[i4 + 2]);
      const differs = delta > 54;
      if (differs) changed++;
      if (overlayData) {
        if (differs) {
          overlayData.data[i4] = 255;
          overlayData.data[i4 + 1] = 69;
          overlayData.data[i4 + 2] = 58;
          overlayData.data[i4 + 3] = 235;
        } else {
          overlayData.data[i4] = aData.data[i4];
          overlayData.data[i4 + 1] = aData.data[i4 + 1];
          overlayData.data[i4 + 2] = aData.data[i4 + 2];
          overlayData.data[i4 + 3] = 255;
        }
      }
    }

    const change = changed / totalPx;
    if (change > 0.0015) changedPages++;

    const entry: ComparedPage = { pageIndex: i, change };
    if (pages.filter((p) => p.overlay).length < MAX_PREVIEWS && change > 0.0015) {
      if (overlayData && octx) {
        octx.putImageData(overlayData, 0, 0);
        entry.overlay = overlay.toDataURL("image/jpeg", 0.72);
      }
      entry.left = a.toDataURL("image/jpeg", 0.68);
      entry.right = b.toDataURL("image/jpeg", 0.68);
    }
    pages.push(entry);
  }

  return {
    pages,
    changedPages,
    totalPages: total,
    leftPages: left.numPages,
    rightPages: right.numPages,
  };
}

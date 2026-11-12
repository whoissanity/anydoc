import { PDFDocument, degrees, rgb } from "pdf-lib";
import { loadPdfLib, savePdfBytes, PAGE_PRESETS } from "@/lib/document/pages";
import { detectRotations, loadRasterDoc, renderRasterPage, type RotationGuess } from "@/lib/document/raster";

export interface CropBox {
  pageIndex: number;
  /** PDF user-space coordinates, origin bottom-left */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Applies a crop via CropBox and TrimBox so the content stream stays intact and the crop stays reversible. */
export async function cropPages(bytes: Uint8Array, boxes: CropBox[]): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  for (const box of boxes) {
    if (box.pageIndex < 0 || box.pageIndex >= doc.getPageCount()) continue;
    const page = doc.getPage(box.pageIndex);
    const media = page.getMediaBox();
    const x = Math.max(media.x, box.x);
    const y = Math.max(media.y, box.y);
    const width = Math.max(6, Math.min(box.width, media.x + media.width - x));
    const height = Math.max(6, Math.min(box.height, media.y + media.height - y));
    page.setCropBox(x, y, width, height);
    page.setTrimBox(x, y, width, height);
  }
  return savePdfBytes(doc);
}

/** CSS-pixel margins -> PDF boxes, honouring the page's visible (cropped) box. */
export function marginsToBoxes(
  margins: { top: number; right: number; bottom: number; left: number },
  targets: Array<{ pageIndex: number; width: number; height: number }>
): CropBox[] {
  return targets.map((t) => ({
    pageIndex: t.pageIndex,
    x: margins.left,
    y: margins.bottom,
    width: Math.max(6, t.width - margins.left - margins.right),
    height: Math.max(6, t.height - margins.top - margins.bottom),
  }));
}

/** Auto-trims white margins by rendering at 2x and mapping ink back to points; /Rotate pages are skipped (non-linear map). */
export async function detectContentBoxes(
  bytes: Uint8Array,
  targets: number[],
  padding = 6,
  onProgress?: (msg: string) => void
): Promise<CropBox[]> {
  const raster = await loadRasterDoc(bytes);
  const boxes: CropBox[] = [];

  for (const pageIndex of targets) {
    onProgress?.(`Scanning page ${pageIndex + 1}…`);
    const page = await raster.getPage(pageIndex + 1);
    if (page.rotate % 360 !== 0) continue;

    const scale = 2;
    const canvas = await renderRasterPage(raster, pageIndex + 1, scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] < 246 || data[i + 1] < 246 || data[i + 2] < 246) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) continue; // blank page — keep as-is

    const view = page.getViewport({ scale: 1 });
    const toPt = view.width / canvas.width;
    const pad = padding;
    const x = Math.max(0, minX * toPt - pad);
    const yTop = Math.max(0, minY * toPt - pad);
    const width = Math.min(view.width - x, (maxX - minX + 1) * toPt + pad * 2);
    const height = Math.min(view.height - yTop, (maxY - minY + 1) * toPt + pad * 2);

    boxes.push({
      pageIndex,
      x,
      y: Math.max(0, view.height - yTop - height),
      width: Math.max(6, width),
      height: Math.max(6, height),
    });
  }

  return boxes;
}

export type ResizeFit = "contain" | "stretch";

/** Resizes the page canvas to a preset or custom paper size. */
export async function resizePages(
  bytes: Uint8Array,
  opts: {
    preset: keyof typeof PAGE_PRESETS | "custom";
    width: number;
    height: number;
    orientation: "auto" | "portrait" | "landscape";
    fit: ResizeFit;
  }
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const base =
    opts.preset === "custom" ? [opts.width, opts.height] : PAGE_PRESETS[opts.preset] ?? PAGE_PRESETS.a4;

  for (const page of doc.getPages()) {
    let targetW = base[0];
    let targetH = base[1];
    const current = page.getSize();
    const isLandscape = current.width > current.height;
    if (
      opts.orientation === "landscape" ||
      (opts.orientation === "auto" && isLandscape)
    ) {
      targetW = Math.max(targetW, targetH);
      targetH = Math.min(base[0], base[1]);
    }
    if (opts.orientation === "portrait" || (opts.orientation === "auto" && !isLandscape)) {
      targetW = Math.min(targetW, targetH);
      targetH = Math.max(base[0], base[1]);
    }

    const sx = opts.fit === "stretch" ? targetW / current.width : Math.min(targetW / current.width, targetH / current.height);
    const sy = opts.fit === "stretch" ? targetH / current.height : sx;

    page.scaleContent(sx, sy);
    page.setSize(targetW, targetH);
    page.translateContent(
      (targetW - current.width * sx) / 2,
      (targetH - current.height * sy) / 2
    );
  }

  return savePdfBytes(doc);
}

export type NUpLayout = "2x1" | "1x2" | "2x2" | "3x2" | "3x3";

const GRIDS: Record<NUpLayout, { cols: number; rows: number }> = {
  "2x1": { cols: 2, rows: 1 },
  "1x2": { cols: 1, rows: 2 },
  "2x2": { cols: 2, rows: 2 },
  "3x2": { cols: 3, rows: 2 },
  "3x3": { cols: 3, rows: 3 },
};

/** Multi-page (N-up) layout: puts several source pages on each printed sheet. */
export async function nUpPdf(
  bytes: Uint8Array,
  opts: {
    layout: NUpLayout;
    preset: keyof typeof PAGE_PRESETS | "auto";
    gap: number;
    margin: number;
    border: boolean;
    repeat: boolean;
  },
  onProgress?: (msg: string) => void
): Promise<Uint8Array> {
  const src = await loadPdfLib(bytes);
  const out = await PDFDocument.create();
  const { cols, rows } = GRIDS[opts.layout];
  const perSheet = cols * rows;
  const pages = src.getPages();
  const first = pages[0]?.getSize() ?? { width: PAGE_PRESETS.a4[0], height: PAGE_PRESETS.a4[1] };

  let sheetW = first.width;
  let sheetH = first.height;
  if (opts.preset === "auto") {
    if (cols > rows && sheetH > sheetW) [sheetW, sheetH] = [sheetH, sheetW];
    if (rows > cols && sheetW > sheetH) [sheetW, sheetH] = [sheetH, sheetW];
  } else {
    const [w, h] = PAGE_PRESETS[opts.preset] ?? PAGE_PRESETS.a4;
    if (cols >= rows) {
      sheetW = Math.max(w, h);
      sheetH = Math.min(w, h);
    } else {
      sheetW = Math.min(w, h);
      sheetH = Math.max(w, h);
    }
  }

  const cellW = (sheetW - opts.margin * 2 - opts.gap * (cols - 1)) / cols;
  const cellH = (sheetH - opts.margin * 2 - opts.gap * (rows - 1)) / rows;

  for (let i = 0; i < pages.length; i += perSheet) {
    onProgress?.(`Sheet ${Math.floor(i / perSheet) + 1} / ${Math.ceil(pages.length / perSheet)}`);
    const sheet = out.addPage([sheetW, sheetH]);
    const group = pages.slice(i, i + perSheet);

    for (let cell = 0; cell < perSheet; cell++) {
      const source = group[cell] ?? (opts.repeat ? group[group.length - 1] : undefined);
      if (!source) continue;

      const embedded = await out.embedPage(source);
      const availW = cellW;
      const availH = cellH;
      const scale = Math.min(availW / embedded.width, availH / embedded.height);
      const drawW = embedded.width * scale;
      const drawH = embedded.height * scale;
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      const x = opts.margin + col * (cellW + opts.gap) + (availW - drawW) / 2;
      const y = sheetH - opts.margin - row * (cellH + opts.gap) - drawH - (availH - drawH) / 2;

      if (opts.border) {
        sheet.drawRectangle({
          x: opts.margin + col * (cellW + opts.gap),
          y: sheetH - opts.margin - row * (cellH + opts.gap) - cellH,
          width: cellW,
          height: cellH,
          borderColor: rgb(0.6, 0.6, 0.6),
          borderWidth: 0.75,
          opacity: 0,
        });
      }
      sheet.drawPage(embedded, { x, y, width: drawW, height: drawH });
    }
  }

  return savePdfBytes(out);
}

/** Classic saddle-stitch booklet imposition order (padded to a multiple of 4). */
export function bookletOrder(pageCount: number): Array<[number | null, number | null]> {
  const padded = Math.max(4, Math.ceil(pageCount / 4) * 4);
  const sides = padded / 2;
  const result: Array<[number | null, number | null]> = [];
  for (let i = 0; i < sides; i++) {
    if (i % 2 === 0) {
      result.push([padded - i - 1, i]);
    } else {
      result.push([i, padded - i - 1]);
    }
  }
  return result.map((pair) =>
    pair.map((p) => (p == null || p >= pageCount ? null : p)) as [number | null, number | null]
  );
}

/** Reorders pages for booklet printing: fold, staple, read. */
export async function bookletPdf(
  bytes: Uint8Array,
  opts: { gutter: number; margin: number }
): Promise<Uint8Array> {
  const src = await loadPdfLib(bytes);
  const order = bookletOrder(src.getPageCount());
  const first = src.getPages()[0]?.getSize() ?? { width: PAGE_PRESETS.a4[0], height: PAGE_PRESETS.a4[1] };
  const halfW = Math.min(first.width, first.height);
  const halfH = Math.max(first.width, first.height);
  const sheetW = halfW * 2 + opts.gutter + opts.margin * 2;
  const sheetH = halfH + opts.margin * 2;

  const out = await PDFDocument.create();
  const pages = src.getPages();

  for (const [leftIdx, rightIdx] of order) {
    const sheet = out.addPage([sheetW, sheetH]);
    const slots: Array<{ index: number | null; x: number }> = [
      { index: leftIdx, x: opts.margin },
      { index: rightIdx, x: opts.margin + halfW + opts.gutter },
    ];
    for (const slot of slots) {
      if (slot.index == null) continue;
      const source = pages[slot.index];
      const embedded = await out.embedPage(source);
      const scale = Math.min(halfW / embedded.width, halfH / embedded.height);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      sheet.drawPage(embedded, {
        x: slot.x + (halfW - w) / 2,
        y: opts.margin + (halfH - h) / 2,
        width: w,
        height: h,
      });
    }
  }

  return savePdfBytes(out);
}

/** Stitches every page into one long continuous page (great for chat threads). */
export async function singleLongPage(
  bytes: Uint8Array,
  opts: { gap: number; maxWidth: number }
): Promise<Uint8Array> {
  const src = await loadPdfLib(bytes);
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const embedded = await Promise.all(pages.map((p) => out.embedPage(p)));

  const width = Math.max(...embedded.map((e) => e.width), opts.maxWidth);
  const totalHeight = embedded.reduce((sum, e) => sum + e.height, 0) + opts.gap * (embedded.length - 1);
  const page = out.addPage([width, Math.max(totalHeight, 1)]);

  let cursor = totalHeight;
  for (const emb of embedded) {
    cursor -= emb.height;
    page.drawPage(emb, { x: (width - emb.width) / 2, y: cursor, width: emb.width, height: emb.height });
    cursor -= opts.gap;
  }

  return savePdfBytes(out);
}

export async function rotateAllPages(bytes: Uint8Array, angle: 90 | 180 | 270): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  for (const page of doc.getPages()) {
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return savePdfBytes(doc);
}

export async function applyPageRotations(
  bytes: Uint8Array,
  rotations: Array<{ pageIndex: number; angle: number }>
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  for (const r of rotations) {
    if (r.pageIndex < 0 || r.pageIndex >= doc.getPageCount()) continue;
    const page = doc.getPage(r.pageIndex);
    page.setRotation(degrees(((page.getRotation().angle + r.angle) % 360 + 360) % 360));
  }
  return savePdfBytes(doc);
}

/** Re-exports so the tool UI can show a review list before committing. */
export async function suggestRotations(bytes: Uint8Array): Promise<RotationGuess[]> {
  return detectRotations(bytes);
}

/** Stamps a second PDF on top of the open one (letterheads, forms, banners); drawn after base content, follows page order. */
export async function overlayPdf(
  baseBytes: Uint8Array,
  overlayBytes: Uint8Array,
  opts: { opacity: number; repeatLast: boolean; scale: "fit" | "actual" }
): Promise<{ bytes: Uint8Array; applied: number }> {
  const base = await loadPdfLib(baseBytes);
  const overlay = await loadPdfLib(overlayBytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(base, base.getPageIndices());
  copied.forEach((page) => out.addPage(page));

  const overlayPages = overlay.getPages();
  if (!overlayPages.length) throw new Error("The overlay PDF has no pages");

  let applied = 0;
  for (let i = 0; i < out.getPageCount(); i++) {
    const source = overlayPages[Math.min(i, overlayPages.length - 1)];
    if (i >= overlayPages.length && !opts.repeatLast) break;

    const embedded = await out.embedPage(source);
    const page = out.getPage(i);
    const { width, height } = page.getSize();
    const scale =
      opts.scale === "fit"
        ? Math.min(width / embedded.width, height / embedded.height)
        : 1;
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;

    page.drawPage(embedded, {
      x: (width - drawW) / 2,
      y: (height - drawH) / 2,
      width: drawW,
      height: drawH,
      opacity: opts.opacity,
    });
    applied++;
  }

  return { bytes: await savePdfBytes(out), applied };
}

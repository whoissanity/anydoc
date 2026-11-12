"use client";

import type { OcrPage, OcrWordBox } from "@/lib/types";
import { loadRasterDoc, type RasterDoc } from "@/lib/document/raster";
import { withRenderLock } from "@/lib/document/render-queue";
import { collectRawWords, normalizeWords, type RawOcrData } from "./normalize";
import { tesseractAssetPaths } from "./tesseract-assets";

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface RecognizeOptions {
  lang?: string;
  onProgress?: (progress: OcrProgress) => void;
}

/** Recognition needs detail the viewer does not have at fit-to-width zoom. */
const MIN_OCR_SCALE = 2;
/** Upper bound on a rendered dimension, so a huge page cannot exhaust memory. */
const MAX_OCR_PIXELS = 4096;

/** Renders a page at >=2× on its own document instance; a render sharing the viewer's proxy never settles. */
export async function renderPageForOcr(
  bytes: Uint8Array,
  pageNumber: number,
  scale = MIN_OCR_SCALE
): Promise<HTMLCanvasElement> {
  const doc: RasterDoc = await loadRasterDoc(bytes);
  try {
    const page = await doc.getPage(pageNumber);
    const requested = Math.max(MIN_OCR_SCALE, scale);
    let viewport = page.getViewport({ scale: requested });

    const widest = Math.max(viewport.width, viewport.height);
    if (widest > MAX_OCR_PIXELS) {
      viewport = page.getViewport({ scale: (requested * MAX_OCR_PIXELS) / widest });
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not create a canvas for OCR");
    // Tesseract reads the bitmap as-is; an unpainted canvas is transparent black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await withRenderLock(() => page.render({ canvasContext: ctx, viewport }).promise);
    return canvas;
  } finally {
    await doc.destroy();
  }
}

/** Returns 0–1 word boxes for a rendered page; v6's default output omits blocks, so an explicit worker requests them. */
export async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  pageIndex: number,
  options: RecognizeOptions = {}
): Promise<OcrPage> {
  const { lang = "eng", onProgress } = options;
  const width = canvas.width || 1;
  const height = canvas.height || 1;

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(lang, 1, {
    ...tesseractAssetPaths(),
    logger: (message) => {
      onProgress?.({
        status: message.status,
        progress: typeof message.progress === "number" ? message.progress : 0,
      });
    },
  });

  try {
    const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const data = result.data as unknown as RawOcrData;
    const words: OcrWordBox[] = normalizeWords(collectRawWords(data), width, height);
    return {
      pageIndex,
      text: data.text ?? "",
      words,
      createdAt: Date.now(),
    };
  } finally {
    await worker.terminate();
  }
}

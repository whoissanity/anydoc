"use client";

import type { OcrPage, OcrWordBox } from "@/lib/types";
import { loadRasterDoc, type RasterDoc } from "@/lib/document/raster";
import { withRenderLock } from "@/lib/document/render-queue";
import { collectRawWords, normalizeWords, MIN_WORD_CONFIDENCE, type RawOcrData } from "./normalize";
import { createOcrWorker } from "./worker";
import { deskewCanvas, estimateSkewAngle, mapWordFromDeskew } from "./deskew";

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface RecognizeOptions {
  lang?: string;
  onProgress?: (progress: OcrProgress) => void;
  /** Resolution of the rendered bitmap, so Tesseract does not assume 70 dpi. */
  dpi?: number;
  /** Degrees the bitmap was straightened by; word boxes are mapped back. */
  skewAngle?: number;
}

export interface RenderedOcrPage {
  /** Straightened when the page was skewed. */
  canvas: HTMLCanvasElement;
  dpi: number;
  skewAngle: number;
}

/** Recognition needs detail the viewer does not have at fit-to-width zoom. */
const MIN_OCR_SCALE = 2;
/** Upper bound on a rendered dimension, so a huge page cannot exhaust memory. */
const MAX_OCR_PIXELS = 4096;
/** PDF user space is 72 dpi; the render scale turns that into bitmap dpi. */
const PDF_DPI = 72;

/**
 * Renders a page at >=2× on its own document instance; a render sharing the
 * viewer's proxy never settles. The page is straightened when a small scan skew
 * is detected, and the bitmap's real dpi is reported for recognition.
 */
export async function renderPageForOcr(
  bytes: Uint8Array,
  pageNumber: number,
  scale = MIN_OCR_SCALE
): Promise<RenderedOcrPage> {
  const doc: RasterDoc = await loadRasterDoc(bytes);
  try {
    const page = await doc.getPage(pageNumber);
    const requested = Math.max(MIN_OCR_SCALE, scale);
    const baseViewport = page.getViewport({ scale: 1 });
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

    const dpi = Math.max(1, Math.round(PDF_DPI * (canvas.width / Math.max(1, baseViewport.width))));
    const skewAngle = estimateSkewAngle(canvas);
    return {
      canvas: skewAngle ? deskewCanvas(canvas, skewAngle) : canvas,
      dpi,
      skewAngle,
    };
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
  const { lang = "eng", onProgress, dpi = 300, skewAngle = 0 } = options;
  const width = canvas.width || 1;
  const height = canvas.height || 1;

  const worker = await createOcrWorker(lang, (message) => {
    onProgress?.({
      status: message.status,
      progress: typeof message.progress === "number" ? message.progress : 0,
    });
  });

  try {
    await worker.setParameters({
      user_defined_dpi: String(Math.max(70, Math.round(dpi))),
      preserve_interword_spaces: "1",
    });
    const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const data = result.data as unknown as RawOcrData;
    const words: OcrWordBox[] = normalizeWords(
      collectRawWords(data),
      width,
      height,
      MIN_WORD_CONFIDENCE
    );
    return {
      pageIndex,
      text: data.text ?? "",
      words: skewAngle
        ? words.map((word) => mapWordFromDeskew(word, skewAngle, width, height))
        : words,
      createdAt: Date.now(),
    };
  } finally {
    await worker.terminate();
  }
}

"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getPdfjs } from "@/lib/document/load";
import { savePdfBytes } from "@/lib/document/pages";
import { canvasToPngBytes } from "@/lib/document/raster";
import { withRenderLock } from "@/lib/document/render-queue";
import { tesseractAssetPaths } from "@/lib/ocr/tesseract-assets";

/** Recognition scale: the page is rasterised at 2× before Tesseract sees it. */
const OCR_SCALE = 2;

export async function runOcrOnPdf(
  bytes: Uint8Array,
  languages = "eng",
  onProgress?: (msg: string) => void
): Promise<Uint8Array> {
  const { createWorker } = await import("tesseract.js");
  const pdfjs = await getPdfjs();
  const srcDoc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  let currentPage = 1;
  // v6 rule: without `blocks: true` the worker returns text only, so no word boxes exist to place.
  const worker = await createWorker(languages, 1, {
    ...tesseractAssetPaths(),
    logger: (message) => {
      if (message.status === "recognizing text" && message.progress) {
        onProgress?.(`OCR page ${currentPage}: ${Math.round(message.progress * 100)}%`);
      }
    },
  });

  try {
    for (let i = 1; i <= srcDoc.numPages; i++) {
      currentPage = i;
      onProgress?.(`OCR page ${i} / ${srcDoc.numPages}…`);
      const page = await srcDoc.getPage(i);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await withRenderLock(() => page.render({ canvasContext: ctx, viewport }).promise);

      const result = await worker.recognize(canvas, {}, { text: true, blocks: true });

      // Embed page image + invisible searchable text
      const pngBytes = await canvasToPngBytes(canvas);
      const embedded = await out.embedPng(pngBytes);
      const pdfPage = out.addPage([embedded.width / OCR_SCALE, embedded.height / OCR_SCALE]);
      const { width, height } = pdfPage.getSize();
      pdfPage.drawImage(embedded, { x: 0, y: 0, width, height });

      type WordLike = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
      const words: WordLike[] = [];
      const blocks = result.data.blocks || [];
      for (const block of blocks) {
        for (const para of block.paragraphs || []) {
          for (const line of para.lines || []) {
            for (const word of line.words || []) {
              words.push(word);
            }
          }
        }
      }
      // Fallback: place full page text if word boxes unavailable
      if (!words.length && result.data.text?.trim()) {
        try {
          pdfPage.drawText(result.data.text.slice(0, 2000), {
            x: 12,
            y: height - 24,
            size: 8,
            font,
            color: rgb(0, 0, 0),
            opacity: 0.01,
            maxWidth: width - 24,
            lineHeight: 10,
          });
        } catch {
          // ignore
        }
      }
      for (const word of words) {
        if (!word.text?.trim()) continue;
        const bbox = word.bbox;
        const scaleX = width / canvas.width;
        const scaleY = height / canvas.height;
        const w = (bbox.x1 - bbox.x0) * scaleX;
        const h = Math.max(6, (bbox.y1 - bbox.y0) * scaleY);
        const x = bbox.x0 * scaleX;
        const y = height - bbox.y1 * scaleY;
        try {
          pdfPage.drawText(word.text, {
            x,
            y,
            size: Math.min(h, 14),
            font,
            color: rgb(0, 0, 0),
            opacity: 0.01,
            maxWidth: Math.max(w, 10),
          });
        } catch {
          // skip unencodable glyphs in Helvetica
        }
      }
    }
  } finally {
    await worker.terminate();
  }

  onProgress?.("Finalizing searchable PDF…");
  return savePdfBytes(out);
}

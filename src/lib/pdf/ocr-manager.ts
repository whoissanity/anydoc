import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { canvasToPngBytes, loadRasterDoc, type RasterDoc } from "@/lib/document/raster";
import { withRenderLock } from "@/lib/document/render-queue";
import { savePdfBytes } from "@/lib/document/pages";
import { embedAppFont } from "@/lib/text/embedded-fonts";
import type { OcrPage } from "@/lib/types";
import type {
  OcrEngine,
  OcrPagePayload,
  OcrProgressUpdate,
  OcrRecognizeRequest,
  OcrWorkerRequest,
  OcrWorkerResponse,
} from "@/lib/pdf/ocr-protocol";

export const OCR_DPI = 150;
const PDF_DPI = 72;
/** A safety cap for pathological page sizes; normal pages render at exactly 150 dpi. */
const MAX_OCR_PIXELS = 6000;

export interface OcrWorkerLike {
  postMessage(message: OcrWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<OcrWorkerResponse>) => void
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<OcrWorkerResponse>) => void
  ): void;
}

export interface RunOcrPipelineOptions {
  bytes: Uint8Array;
  language?: string;
  dpi?: number;
  onProgress?: (update: OcrProgressUpdate) => void;
  signal?: AbortSignal;
  /** Injected in tests; defaults to the isolated module worker. */
  createWorker?: () => OcrWorkerLike;
}

export interface OcrPipelineResult {
  bytes: Uint8Array;
  pages: OcrPage[];
  engines: OcrEngine[];
}

function defaultCreateWorker(): OcrWorkerLike {
  return new Worker(new URL("../../workers/ocr.worker.ts", import.meta.url), {
    type: "module",
  });
}

function throwIfAborted(signal: AbortSignal | undefined, aborted: boolean): void {
  if (aborted || signal?.aborted) throw new Error("OCR cancelled");
}

function drawSearchableText(
  page: PDFPage,
  result: OcrPagePayload,
  font: PDFFont
): void {
  const { width, height } = page.getSize();

  if (!result.words.length && result.text.trim()) {
    try {
      page.drawText(result.text.slice(0, 2000), {
        x: 12,
        y: height - 24,
        size: 8,
        font,
        color: rgb(0, 0, 0),
        opacity: 0.01,
        maxWidth: Math.max(1, width - 24),
        lineHeight: 10,
      });
    } catch {
      // An empty or unsupported glyph run must not fail the page.
    }
    return;
  }

  for (const word of result.words) {
    if (!word.text.trim()) continue;
    const w = Math.max(1, word.width * width);
    const h = Math.max(6, word.height * height);
    const x = word.x * width;
    const y = height - (word.y + word.height) * height;
    try {
      page.drawText(word.text, {
        x,
        y,
        size: Math.min(h, 14),
        font,
        color: rgb(0, 0, 0),
        opacity: 0.01,
        maxWidth: Math.max(w, 10),
        lineHeight: Math.max(8, h),
      });
    } catch {
      // Skip words the embedded font cannot encode.
    }
  }
}

/**
 * Renders each page at 150 dpi, sends it to the isolated OCR worker, and
 * assembles an invisible text layer page-by-page. Pages are processed in order
 * from page 1; the current canvas and PDF.js page are released before the next.
 */
export async function runOcrPipeline(
  options: RunOcrPipelineOptions
): Promise<OcrPipelineResult> {
  const {
    bytes,
    language = "eng",
    dpi = OCR_DPI,
    onProgress,
    signal,
    createWorker = defaultCreateWorker,
  } = options;

  throwIfAborted(signal, false);

  const worker = createWorker();
  let doc: RasterDoc | null = null;
  let renderTask: { cancel(): void } | null = null;
  let aborted = false;
  let jobId = 0;

  const pending = new Map<
    number,
    { resolve: (page: OcrPagePayload) => void; reject: (error: Error) => void }
  >();

  const onMessage = (event: MessageEvent<OcrWorkerResponse>) => {
    const message = event.data;
    if (message.type === "progress") {
      onProgress?.({
        page: message.pageIndex + 1,
        total: doc?.numPages ?? 0,
        status: message.status,
        engine: message.engine,
      });
      return;
    }

    const pendingItem = pending.get(message.id);
    if (!pendingItem) return;
    pending.delete(message.id);
    if (message.type === "result") pendingItem.resolve(message.page);
    else pendingItem.reject(new Error(message.message));
  };

  const abort = () => {
    aborted = true;
    try {
      renderTask?.cancel();
    } catch {
      // The render may already have finished.
    }
    for (const item of pending.values()) {
      item.reject(new Error("OCR cancelled"));
    }
    pending.clear();
    worker.terminate();
  };

  worker.addEventListener("message", onMessage);
  signal?.addEventListener("abort", abort, { once: true });

  const out = await PDFDocument.create();
  const pages: OcrPage[] = [];
  const engines: OcrEngine[] = [];

  try {
    doc = await loadRasterDoc(bytes);
    const total = doc.numPages;

    for (let i = 1; i <= total; i++) {
      throwIfAborted(signal, aborted);
      const page = await doc.getPage(i);

      let scale = dpi / PDF_DPI;
      let viewport = page.getViewport({ scale });
      const longest = Math.max(viewport.width, viewport.height);
      if (longest > MAX_OCR_PIXELS) {
        scale = (scale * MAX_OCR_PIXELS) / longest;
        viewport = page.getViewport({ scale });
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Could not create a canvas for OCR");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      onProgress?.({
        page: i,
        total,
        status: `Rendering page ${i} at ${Math.round(dpi)} DPI…`,
        engine: "paddle",
      });

      const task = page.render({ canvasContext: ctx, viewport });
      renderTask = task;
      try {
        await withRenderLock(() => task.promise);
      } finally {
        renderTask = null;
      }
      throwIfAborted(signal, aborted);

      const png = await canvasToPngBytes(canvas);
      const imageBuffer = png.buffer.slice(
        png.byteOffset,
        png.byteOffset + png.byteLength
      ) as ArrayBuffer;

      const id = ++jobId;
      const result = await new Promise<OcrPagePayload>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const request: OcrRecognizeRequest = {
          type: "recognize",
          id,
          pageIndex: i - 1,
          image: imageBuffer,
          width: canvas.width,
          height: canvas.height,
          dpi,
          language,
        };
        worker.postMessage(request, [imageBuffer]);
      });

      pages.push({
        pageIndex: result.pageIndex,
        text: result.text,
        words: result.words,
        createdAt: Date.now(),
      });
      engines.push(result.engine);

      const embedded = await out.embedPng(png);
      const pdfPage = out.addPage([
        embedded.width / scale,
        embedded.height / scale,
      ]);
      // Pick a script-covered face for this page's recognized language.
      const font = await embedAppFont(out, { text: result.text.slice(0, 20_000) });
      drawSearchableText(pdfPage, result, font);

      try {
        page.cleanup();
      } catch {
        // pdf.js may not expose cleanup on every build.
      }
      canvas.width = 0;
      canvas.height = 0;
    }

    onProgress?.({
      page: total,
      total,
      status: "Finalizing searchable PDF…",
      engine: engines.includes("tesseract") ? "tesseract" : "paddle",
    });

    const output = await savePdfBytes(out);
    return { bytes: output, pages, engines };
  } finally {
    signal?.removeEventListener("abort", abort);
    worker.removeEventListener("message", onMessage);
    worker.terminate();
    for (const item of pending.values()) {
      item.reject(new Error("OCR stopped"));
    }
    pending.clear();
    await doc?.destroy();
  }
}
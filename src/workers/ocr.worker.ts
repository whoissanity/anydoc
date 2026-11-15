/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import {
  averageConfidence,
  type OcrEngine,
  type OcrPagePayload,
  type OcrWorkerRequest,
  type OcrWorkerResponse,
} from "@/lib/pdf/ocr-protocol";
import {
  recognizePageWithFallback,
  type PaddleServiceLike,
} from "@/lib/pdf/ocr-engine";
import { collectRawWords, MIN_WORD_CONFIDENCE, normalizeWords, type RawOcrData } from "@/lib/ocr/normalize";
import { createOcrWorker } from "@/lib/ocr/worker";

/**
 * Module workers can be backed by a blob: URL, where a root-relative fetch path
 * cannot be resolved by WorkerGlobalScope. Every vendored asset must be an
 * absolute same-origin URL; this is also what keeps ONNX Runtime off its CDN
 * default and the Paddle models off their catalogue URLs.
 */
function vendorUrl(...segments: string[]): string {
  const origin =
    typeof self !== "undefined" && "location" in self
      ? (self as unknown as { location: Location }).location.origin
      : "";
  return `${origin}/vendor/${segments.join("/")}`;
}

// Must be set before ppu-paddle-ocr imports onnxruntime-web; its web platform
// otherwise rewrites the path to a CDN.
ort.env.wasm.wasmPaths = vendorUrl("onnxruntime") + "/";
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const workerScope = self as unknown as {
  postMessage(message: OcrWorkerResponse): void;
  onmessage: ((event: MessageEvent<OcrWorkerRequest>) => void) | null;
};

// Tesseract.js resolves its asset URLs through `window.location.href`, which
// throws in a worker even though spawning its own worker from here is valid.
// The alias is installed before the library's dynamic import; it only uses
// location, never DOM APIs.
const workerGlobal = self as unknown as { window?: unknown };
workerGlobal.window ??= workerGlobal;

let paddle: PaddleServiceLike | null = null;
let paddleInitFailed = false;
let tesseract: Awaited<ReturnType<typeof createOcrWorker>> | null = null;
let tesseractLanguage = "";
let cancelled = false;

function postProgress(pageIndex: number, status: string, engine?: OcrEngine): void {
  workerScope.postMessage({ type: "progress", pageIndex, status, engine });
}

function postError(id: number, error: unknown): void {
  workerScope.postMessage({
    type: "error",
    id,
    message: error instanceof Error ? error.message : String(error),
  });
}

async function getPaddle(): Promise<PaddleServiceLike> {
  if (paddle) return paddle;
  if (paddleInitFailed) throw new Error("PaddleOCR is unavailable");

  try {
    const { PaddleOcrService } = await import("ppu-paddle-ocr/web");
    const service = new PaddleOcrService({
      model: {
        detection: vendorUrl("paddleocr", "PP-OCRv6_tiny_det.ort"),
        recognition: vendorUrl("paddleocr", "PP-OCRv6_tiny_rec.ort"),
        charactersDictionary: vendorUrl("paddleocr", "ppocrv6_tiny_dict.txt"),
      },
      processing: { engine: "canvas-native" },
      session: { executionProviders: ["wasm"] },
    });
    await service.initialize();
    paddle = service as unknown as PaddleServiceLike;
    return paddle;
  } catch (error) {
    paddleInitFailed = true;
    throw error;
  }
}

async function getTesseract(
  language: string,
  onStatus: (status: string) => void
): Promise<Awaited<ReturnType<typeof createOcrWorker>>> {
  if (tesseract && tesseractLanguage === language) return tesseract;
  if (tesseract) {
    await tesseract.terminate();
    tesseract = null;
  }
  tesseractLanguage = language;
  tesseract = await createOcrWorker(language, (message) => onStatus(message.status));
  return tesseract;
}

async function recognizeWithTesseract(
  image: ArrayBuffer,
  pageIndex: number,
  language: string,
  dpi: number,
  width: number,
  height: number,
  onStatus: (status: string) => void
): Promise<OcrPagePayload> {
  const worker = await getTesseract(language, onStatus);
  await worker.setParameters({
    user_defined_dpi: String(Math.max(70, Math.round(dpi))),
    preserve_interword_spaces: "1",
  });

  const blob = new Blob([image], { type: "image/png" });
  const result = await worker.recognize(blob, {}, { text: true, blocks: true });
  const data = result.data as unknown as RawOcrData;
  const words = normalizeWords(
    collectRawWords(data),
    Math.max(1, width),
    Math.max(1, height),
    MIN_WORD_CONFIDENCE
  );
  return {
    pageIndex,
    text: data.text ?? "",
    words,
    engine: "tesseract",
    confidence: averageConfidence(words),
  };
}

async function recognizePage(
  request: Extract<OcrWorkerRequest, { type: "recognize" }>
): Promise<OcrPagePayload> {
  if (cancelled) throw new Error("OCR cancelled");

  // After an initialization failure Paddle is not retried on every page: the
  // remaining pages go straight to Tesseract.
  if (!paddleInitFailed) {
    return recognizePageWithFallback(request, {
      getPaddle,
      recognizeWithTesseract: (_request, onStatus) =>
        recognizeWithTesseract(
          request.image,
          request.pageIndex,
          request.language,
          request.dpi,
          request.width,
          request.height,
          onStatus
        ),
      onProgress: postProgress,
      isCancelled: () => cancelled,
    });
  }

  return recognizeWithTesseract(
    request.image,
    request.pageIndex,
    request.language,
    request.dpi,
    request.width,
    request.height,
    (status) => postProgress(request.pageIndex, status, "tesseract")
  );
}

workerScope.onmessage = async (event) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelled = true;
    if (tesseract) {
      await tesseract.terminate();
      tesseract = null;
    }
    return;
  }

  if (message.type !== "recognize") return;

  try {
    const page = await recognizePage(message);
    workerScope.postMessage({ type: "result", id: message.id, page });
  } catch (error) {
    postError(message.id, error);
  }
};

export {};
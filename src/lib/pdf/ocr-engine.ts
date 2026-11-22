import {
  averageConfidence,
  normalizePaddleWords,
  paddleResultNeedsFallback,
  type OcrEngine,
  type OcrPagePayload,
  type OcrRecognizeRequest,
  type PaddleResultLike,
} from "@/lib/pdf/ocr-protocol";

export interface PaddleServiceLike {
  recognize: (
    image: ArrayBuffer,
    options?: { flatten?: boolean; strategy?: string }
  ) => Promise<PaddleResultLike>;
}

export interface RecognizePageDeps {
  /** Resolves an initialised Paddle service; rejects when the engine cannot start. */
  getPaddle: () => Promise<PaddleServiceLike>;
  /** Runs Tesseract for the page and forwards its internal status messages. */
  recognizeWithTesseract: (
    request: OcrRecognizeRequest,
    onStatus: (status: string) => void
  ) => Promise<OcrPagePayload>;
  onProgress: (pageIndex: number, status: string, engine?: OcrEngine) => void;
  isCancelled?: () => boolean;
}

/**
 * One page of the dual-engine pipeline. Paddle is attempted first; an
 * initialization/inference error or an empty/low-confidence result falls
 * through to Tesseract for that page instead of rejecting the whole job.
 * Extracted from the worker so the fallback can be unit-tested without
 * booting ONNX Runtime or Tesseract.
 */
export async function recognizePageWithFallback(
  request: OcrRecognizeRequest,
  deps: RecognizePageDeps
): Promise<OcrPagePayload> {
  if (deps.isCancelled?.()) throw new Error("OCR cancelled");

  try {
    deps.onProgress(request.pageIndex, "Loading PaddleOCR…", "paddle");
    const service = await deps.getPaddle();
    deps.onProgress(request.pageIndex, "Detecting text with PaddleOCR…", "paddle");
    const result = (await service.recognize(request.image, {
      flatten: true,
      strategy: "per-line",
    })) as PaddleResultLike;

    if (!paddleResultNeedsFallback(result)) {
      const words = normalizePaddleWords(result, request.width, request.height);
      return {
        pageIndex: request.pageIndex,
        text: result.text,
        words,
        engine: "paddle",
        confidence: averageConfidence(words),
      };
    }

    deps.onProgress(
      request.pageIndex,
      "PaddleOCR returned no confident text — using Tesseract",
      "tesseract"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.onProgress(
      request.pageIndex,
      `PaddleOCR failed (${message}) — using Tesseract`,
      "tesseract"
    );
  }

  return deps.recognizeWithTesseract(request, (status) =>
    deps.onProgress(request.pageIndex, status, "tesseract")
  );
}

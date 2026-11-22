import { describe, expect, it, vi } from "vitest";
import { recognizePageWithFallback, type PaddleServiceLike } from "@/lib/pdf/ocr-engine";
import type {
  OcrEngine,
  OcrPagePayload,
  OcrRecognizeRequest,
  PaddleResultLike,
} from "@/lib/pdf/ocr-protocol";

const request: OcrRecognizeRequest = {
  type: "recognize",
  id: 7,
  pageIndex: 2,
  image: new ArrayBuffer(8),
  width: 400,
  height: 200,
  dpi: 150,
  language: "eng",
};

const paddleResult: PaddleResultLike = {
  text: "Paddle text",
  confidence: 0.92,
  results: [
    { text: "Paddle", confidence: 0.95, box: { x: 40, y: 20, width: 100, height: 30 } },
    { text: "text", confidence: 0.9, box: { x: 150, y: 20, width: 60, height: 30 } },
  ],
};

function tesseractPage(text = "Tesseract text"): OcrPagePayload {
  return {
    pageIndex: request.pageIndex,
    text,
    words: [{ text, confidence: 70, x: 0.1, y: 0.2, width: 0.3, height: 0.1 }],
    engine: "tesseract",
    confidence: 70,
  };
}

function deps(overrides: {
  paddle?: () => Promise<PaddleServiceLike>;
  tesseract?: (onStatus: (status: string) => void) => Promise<OcrPagePayload>;
} = {}) {
  const progress: Array<{ status: string; engine?: OcrEngine }> = [];
  const recognizeWithTesseract = vi.fn(
    async (_request: OcrRecognizeRequest, onStatus: (status: string) => void) => {
      onStatus("Reading text with Tesseract…");
      return overrides.tesseract ? overrides.tesseract(onStatus) : tesseractPage();
    }
  );
  const getPaddle = vi.fn(
    overrides.paddle ??
      (async () => ({ recognize: vi.fn(async () => paddleResult) }) as PaddleServiceLike)
  );
  return {
    progress,
    recognizeWithTesseract,
    getPaddle,
    options: {
      getPaddle,
      recognizeWithTesseract,
      onProgress: (_pageIndex: number, status: string, engine?: OcrEngine) => {
        progress.push({ status, engine });
      },
      isCancelled: () => false,
    },
  };
}

describe("dual-engine page fallback", () => {
  it("falls back to Tesseract when Paddle fails to initialize", async () => {
    const d = deps({
      paddle: async () => {
        throw new Error("wasm init failed");
      },
    });

    const page = await recognizePageWithFallback(request, d.options);

    expect(page.engine).toBe("tesseract");
    expect(page.text).toBe("Tesseract text");
    expect(d.getPaddle).toHaveBeenCalledTimes(1);
    expect(d.recognizeWithTesseract).toHaveBeenCalledTimes(1);
    expect(d.progress.map((entry) => entry.status)).toEqual([
      "Loading PaddleOCR…",
      "PaddleOCR failed (wasm init failed) — using Tesseract",
      "Reading text with Tesseract…",
    ]);
    expect(d.progress.every((entry, index) => index < 1 || entry.engine === "tesseract")).toBe(
      true
    );
  });

  it("falls back when inference throws on one page", async () => {
    const d = deps({
      paddle: async () => ({
        recognize: vi.fn(async () => {
          throw new Error("detection session crashed");
        }),
      }) as PaddleServiceLike,
    });

    const page = await recognizePageWithFallback(request, d.options);

    expect(page.engine).toBe("tesseract");
    expect(d.progress[2].status).toContain("detection session crashed");
    expect(d.recognizeWithTesseract).toHaveBeenCalledTimes(1);
  });

  it("falls back when Paddle returns no confident text", async () => {
    const d = deps({
      paddle: async () =>
        ({
          recognize: vi.fn(async () => ({ text: "", confidence: 0, results: [] })),
        }) as PaddleServiceLike,
    });

    const page = await recognizePageWithFallback(request, d.options);

    expect(page.engine).toBe("tesseract");
    expect(d.progress[2].status).toBe(
      "PaddleOCR returned no confident text — using Tesseract"
    );
  });

  it("uses Paddle alone when it returns confident text", async () => {
    const d = deps();

    const page = await recognizePageWithFallback(request, d.options);

    expect(page.engine).toBe("paddle");
    expect(page.text).toBe("Paddle text");
    expect(page.words.map((word) => word.text)).toEqual(["Paddle", "text"]);
    expect(d.recognizeWithTesseract).not.toHaveBeenCalled();
    expect(d.progress.map((entry) => entry.status)).toEqual([
      "Loading PaddleOCR…",
      "Detecting text with PaddleOCR…",
    ]);
  });

  it("does not start either engine after cancellation", async () => {
    const d = deps();

    await expect(
      recognizePageWithFallback(request, {
        ...d.options,
        isCancelled: () => true,
      })
    ).rejects.toThrow("OCR cancelled");
    expect(d.getPaddle).not.toHaveBeenCalled();
    expect(d.recognizeWithTesseract).not.toHaveBeenCalled();
  });
});

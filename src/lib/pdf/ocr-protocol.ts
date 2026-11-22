import type { OcrWordBox } from "@/lib/types";
import { MIN_WORD_CONFIDENCE, normalizeWords, type RawWord } from "@/lib/ocr/normalize";

export type OcrEngine = "paddle" | "tesseract";

export type OcrWordBoxPayload = OcrWordBox;

export interface OcrPagePayload {
  pageIndex: number;
  text: string;
  words: OcrWordBoxPayload[];
  engine: OcrEngine;
  confidence: number;
}

export interface OcrProgressUpdate {
  page: number;
  total: number;
  status: string;
  engine?: OcrEngine;
}

export interface OcrRecognizeRequest {
  type: "recognize";
  id: number;
  pageIndex: number;
  image: ArrayBuffer;
  width: number;
  height: number;
  dpi: number;
  language: string;
}

export type OcrWorkerRequest = OcrRecognizeRequest | { type: "cancel" };

export type OcrWorkerResponse =
  | { type: "progress"; pageIndex: number; status: string; engine?: OcrEngine }
  | { type: "result"; id: number; page: OcrPagePayload }
  | { type: "error"; id: number; message: string };

export interface PaddleResultLike {
  text: string;
  confidence: number;
  results: Array<{
    text: string;
    confidence: number;
    box: { x: number; y: number; width: number; height: number };
  }>;
}

/** The exact status line shown in the modal: `X/Y: [Status]`. */
export function formatOcrProgress(update: OcrProgressUpdate): string {
  return `${update.page}/${update.total}: ${update.status}`;
}

/** Paddle returns no usable text when detection or recognition produced nothing. */
export function paddleResultNeedsFallback(result: PaddleResultLike): boolean {
  return (
    result.confidence <= 0 ||
    result.results.length === 0 ||
    result.text.trim().length === 0
  );
}

/**
 * Paddle reports confidence on a 0–1 scale and boxes in source pixels. Convert
 * both into the editor's 0–100 / 0–1 word representation.
 */
export function normalizePaddleWords(
  result: PaddleResultLike,
  width: number,
  height: number
): OcrWordBox[] {
  const raw: RawWord[] = result.results.map((item) => ({
    text: item.text,
    confidence: Math.max(0, Math.min(100, item.confidence * 100)),
    bbox: {
      x0: item.box.x,
      y0: item.box.y,
      x1: item.box.x + item.box.width,
      y1: item.box.y + item.box.height,
    },
  }));
  return normalizeWords(raw, width, height, MIN_WORD_CONFIDENCE);
}

export function averageConfidence(words: OcrWordBox[]): number {
  if (!words.length) return 0;
  return words.reduce((total, word) => total + word.confidence, 0) / words.length;
}
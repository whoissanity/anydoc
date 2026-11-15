"use client";

import { tesseractAssetPaths } from "./tesseract-assets";
import { DEFAULT_OCR_LANGUAGE } from "./languages";
import { isPackInstalled, getPackMeta } from "./packs";

export interface OcrLoggerMessage {
  status: string;
  progress?: number;
}

function packLabel(code: string): string {
  const meta = getPackMeta(code);
  return meta ? `"${meta.label}" (${code})` : `"${code}"`;
}

function missingPackError(code: string): Error {
  return new Error(
    `Language pack for ${packLabel(code)} is not installed. Import ${code}.traineddata.gz in OCR Language Packs.`
  );
}

/**
 * Creates a Tesseract worker for `language`, using only locally available packs.
 * A missing pack falls back to English when English is installed; otherwise the
 * caller gets an actionable error rather than an OCR run with no language data.
 */
export async function createOcrWorker(
  language: string,
  logger?: (message: OcrLoggerMessage) => void
) {
  const requested = (language || DEFAULT_OCR_LANGUAGE).trim().toLowerCase();

  let chosen = requested;
  if (!(await isPackInstalled(requested))) {
    if (requested === DEFAULT_OCR_LANGUAGE || !(await isPackInstalled(DEFAULT_OCR_LANGUAGE))) {
      throw missingPackError(requested);
    }
    logger?.({
      status: `Language pack for ${packLabel(requested)} is not installed — using English`,
      progress: 0,
    });
    chosen = DEFAULT_OCR_LANGUAGE;
  }

  const { createWorker } = await import("tesseract.js");
  return createWorker(chosen, 1, { ...tesseractAssetPaths(), logger });
}

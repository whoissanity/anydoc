import type { OcrWordBox } from "@/lib/types";

export interface RawBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RawWord {
  text?: string;
  confidence?: number;
  bbox?: RawBBox;
}

export interface RawOcrData {
  text?: string;
  words?: RawWord[];
  blocks?: Array<{
    paragraphs?: Array<{ lines?: Array<{ words?: RawWord[] }> }>;
  }>;
}

/** Words below this confidence are almost always scan noise, not content. */
export const MIN_WORD_CONFIDENCE = 35;

/**
 * Tesseract returns words at the top level on some versions and only inside
 * blocks on others. Blocks are preferred because their order follows the
 * detected layout: the flat list interleaves the columns of a multi-column page.
 */
export function collectRawWords(data: RawOcrData): RawWord[] {
  const words: RawWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) words.push(word);
      }
    }
  }
  return words.length ? words : data.words ?? [];
}

/** Converts pixel bounding boxes into 0–1 page coordinates so the overlay stays aligned at any zoom or resolution. */
export function normalizeWords(
  words: RawWord[],
  width: number,
  height: number,
  minConfidence = 0
): OcrWordBox[] {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const result: OcrWordBox[] = [];

  for (const word of words) {
    const text = word.text?.trim();
    const bbox = word.bbox;
    if (!text || !bbox) continue;
    const confidence = Math.max(0, Math.min(100, word.confidence ?? 0));
    if (confidence < minConfidence) continue;
    const x = Math.max(0, Math.min(1, bbox.x0 / safeWidth));
    const y = Math.max(0, Math.min(1, bbox.y0 / safeHeight));
    const right = Math.max(0, Math.min(1, bbox.x1 / safeWidth));
    const bottom = Math.max(0, Math.min(1, bbox.y1 / safeHeight));
    if (right - x <= 0 || bottom - y <= 0) continue;
    result.push({
      text,
      confidence,
      x,
      y,
      width: right - x,
      height: bottom - y,
    });
  }

  return result;
}

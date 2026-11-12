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

/** Tesseract returns words at the top level on some versions and only inside blocks on others. */
export function collectRawWords(data: RawOcrData): RawWord[] {
  if (data.words?.length) return data.words;
  const words: RawWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) words.push(word);
      }
    }
  }
  return words;
}

/** Converts pixel bounding boxes into 0–1 page coordinates so the overlay stays aligned at any zoom or resolution. */
export function normalizeWords(
  words: RawWord[],
  width: number,
  height: number
): OcrWordBox[] {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const result: OcrWordBox[] = [];

  for (const word of words) {
    const text = word.text?.trim();
    const bbox = word.bbox;
    if (!text || !bbox) continue;
    const x = Math.max(0, Math.min(1, bbox.x0 / safeWidth));
    const y = Math.max(0, Math.min(1, bbox.y0 / safeHeight));
    const right = Math.max(0, Math.min(1, bbox.x1 / safeWidth));
    const bottom = Math.max(0, Math.min(1, bbox.y1 / safeHeight));
    if (right - x <= 0 || bottom - y <= 0) continue;
    result.push({
      text,
      confidence: Math.max(0, Math.min(100, word.confidence ?? 0)),
      x,
      y,
      width: right - x,
      height: bottom - y,
    });
  }

  return result;
}

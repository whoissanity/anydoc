import type { OcrWordBox } from "@/lib/types";

/**
 * Skew estimation for scanned pages.
 *
 * Text lines are straight but the page may be rotated by a degree or two. The
 * projection-profile method shears the ink by a candidate angle and scores how
 * sharply the rows line up: the angle with the strongest horizontal peaks is
 * the page's skew. Only small angles are corrected — a quarter-turn needs a
 * dedicated orientation pass, not a shear.
 */

const PREVIEW_WIDTH = 600;
const MAX_ANGLE = 6;
const STEP = 0.5;
/** Below this, correction is not worth the resampling blur. */
export const MIN_SKEW_DEGREES = 1.5;
/** A candidate angle must beat the unrotated profile by this factor. */
const MIN_IMPROVEMENT = 1.05;

interface InkPoint {
  x: number;
  y: number;
}

/**
 * Returns the page skew in degrees, or 0 when the page is straight enough.
 * Pure so the geometry can be tested without a canvas.
 */
export function bestSkewAngle(points: readonly InkPoint[]): number {
  if (points.length < 80) return 0;

  let bestAngle = 0;
  let bestScore = -1;
  let uprightScore = -1;

  for (let angle = -MAX_ANGLE; angle <= MAX_ANGLE + 1e-9; angle += STEP) {
    const slope = Math.tan((angle * Math.PI) / 180);
    const rows = new Map<number, number>();
    for (const point of points) {
      const row = Math.round(point.y - slope * point.x);
      rows.set(row, (rows.get(row) ?? 0) + 1);
    }
    // Sum of squared row counts: lines concentrated into few rows score high.
    let score = 0;
    for (const count of rows.values()) score += count * count;

    if (angle === 0) uprightScore = score;
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  if (uprightScore <= 0) return 0;
  if (Math.abs(bestAngle) < MIN_SKEW_DEGREES) return 0;
  return bestScore > uprightScore * MIN_IMPROVEMENT ? bestAngle : 0;
}

/** Downsamples the rendered page and estimates its skew. */
export function estimateSkewAngle(canvas: HTMLCanvasElement): number {
  if (typeof document === "undefined" || !canvas.width || !canvas.height) return 0;

  const scale = Math.min(1, PREVIEW_WIDTH / canvas.width);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;

  const ctx = preview.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;

  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(canvas, 0, 0, width, height);
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    // A tainted or unavailable canvas simply cannot be measured.
    return 0;
  }

  const points: InkPoint[] = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 32) continue;
      const luma = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
      if (luma < 150) points.push({ x, y });
    }
  }
  return bestSkewAngle(points);
}

/** Rotates the page upright by `angle` degrees on a white background. */
export function deskewCanvas(canvas: HTMLCanvasElement, angle: number): HTMLCanvasElement {
  if (!angle) return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((-angle * Math.PI) / 180);
  ctx.translate(-out.width / 2, -out.height / 2);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Maps a word box measured on the deskewed canvas back onto the upright page.
 * The box is re-expressed as the axis-aligned bounds of the rotated rectangle,
 * which stays close enough to highlight skewed text.
 */
export function mapWordFromDeskew(
  word: OcrWordBox,
  angle: number,
  width: number,
  height: number
): OcrWordBox {
  if (!angle) return word;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = width / 2;
  const centerY = height / 2;

  const left = word.x * width;
  const top = word.y * height;
  const right = (word.x + word.width) * width;
  const bottom = (word.y + word.height) * height;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]) {
    const dx = x - centerX;
    const dy = y - centerY;
    const rotatedX = centerX + dx * cos - dy * sin;
    const rotatedY = centerY + dx * sin + dy * cos;
    minX = Math.min(minX, rotatedX);
    minY = Math.min(minY, rotatedY);
    maxX = Math.max(maxX, rotatedX);
    maxY = Math.max(maxY, rotatedY);
  }

  const x = clamp01(minX / width);
  const y = clamp01(minY / height);
  return {
    ...word,
    x,
    y,
    width: Math.min(1 - x, (maxX - minX) / width),
    height: Math.min(1 - y, (maxY - minY) / height),
  };
}

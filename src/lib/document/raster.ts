"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPdfjs } from "@/lib/document/load";
import { withRenderLock } from "@/lib/document/render-queue";

/** Shared rasterisation helpers so every pixel-based tool spins up only one PDF.js doc per operation. */

export type RasterDoc = PDFDocumentProxy;

export async function loadRasterDoc(bytes: Uint8Array): Promise<RasterDoc> {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

export async function renderRasterPage(
  doc: RasterDoc,
  pageNumber: number,
  scale: number
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas rendering is unavailable in this browser");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await withRenderLock(() => page.render({ canvasContext: ctx, viewport }).promise);
  return canvas;
}

export function canvasToBlobUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.86);
}

export async function canvasToJpegBytes(
  canvas: HTMLCanvasElement,
  quality = 0.8
): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Failed to encode page image");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to encode page image");
  return new Uint8Array(await blob.arrayBuffer());
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tight bounding box of drawn ink on a white page (auto-crop and blank-page detection). */
export function inkBounds(canvas: HTMLCanvasElement, tolerance = 12): PixelBox | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const limit = 255 - tolerance;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r < limit || g < limit || b < limit) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function inkRatio(canvas: HTMLCanvasElement, tolerance = 18): number {
  const bounds = inkBounds(canvas, tolerance);
  if (!bounds) return 0;
  return (bounds.width * bounds.height) / (canvas.width * canvas.height);
}

export interface RotationGuess {
  pageIndex: number;
  /** Clockwise correction in degrees: 0, 90, 180 or 270 */
  angle: number;
  confidence: number;
  currentRotation: number;
}

/** Suggests a rotation from the dominant baseline angle of real text; text-less scans are untouched. */
export async function detectRotations(bytes: Uint8Array): Promise<RotationGuess[]> {
  const doc = await loadRasterDoc(bytes);
  const guesses: RotationGuess[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const buckets = [0, 0, 0, 0]; // 0 / 90 / 180 / 270
    let weight = 0;

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [a, b] = item.transform as number[];
      const raw = (Math.atan2(b, a) * 180) / Math.PI;
      const normalized = ((raw % 360) + 360) % 360;
      const bucket = Math.round(normalized / 90) % 4;
      buckets[bucket] += item.str.trim().length;
      weight += item.str.trim().length;
    }

    if (weight < 24) {
      guesses.push({ pageIndex: i - 1, angle: 0, confidence: 0, currentRotation: page.rotate });
      continue;
    }

    const best = buckets.indexOf(Math.max(...buckets));
    const dominant = best * 90;
    const confidence = buckets[best] / weight;
    const delta = ((dominant - (page.rotate || 0)) % 360 + 360) % 360;
    guesses.push({
      pageIndex: i - 1,
      angle: delta,
      confidence,
      currentRotation: page.rotate,
    });
  }

  return guesses;
}

/** Average brightness of a page, used by the contrast/colour tools. */
export function averageLuminance(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 1;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  const stride = Math.max(4, Math.floor(data.length / 4000) * 4);
  let count = 0;
  for (let i = 0; i < data.length; i += stride) {
    total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    count++;
  }
  return count ? total / count / 255 : 1;
}

"use client";

import { getPdfjs } from "@/lib/document/load";
import { withRenderLock } from "@/lib/document/render-queue";

export async function extractTextByPage(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }
  return pages;
}

export async function renderPagesToBlobs(
  bytes: Uint8Array,
  format: "png" | "jpeg",
  scale = 1.5,
  onProgress?: (progress: { percent: number; label: string }) => void
): Promise<Blob[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const blobs: Blob[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    // Rendering is the slow part; packaging the ZIP is reported by the caller.
    onProgress?.({
      percent: Math.round(((i - 1) / Math.max(1, doc.numPages)) * 90),
      label: `Rendering page ${i} of ${doc.numPages}…`,
    });
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await withRenderLock(() => page.render({ canvasContext: ctx, viewport }).promise);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, format === "png" ? "image/png" : "image/jpeg", 0.92)
    );
    if (blob) blobs.push(blob);
  }
  onProgress?.({ percent: 90, label: "Finalising images…" });
  return blobs;
}

export async function createPdfFromHtml(html: string): Promise<Uint8Array> {
  const res = await fetch("/api/convert/from-html", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html }),
  });
  if (!res.ok) throw new Error(await res.text());
  return new Uint8Array(await res.arrayBuffer());
}

export async function createPdfFromOffice(file: File): Promise<Uint8Array> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/convert/from-office", { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return new Uint8Array(await res.arrayBuffer());
}

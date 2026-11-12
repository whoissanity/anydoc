"use client";

import { useEditorStore } from "@/store/editor-store";
import type { ImageObject } from "@/lib/types";
import { readImageFile } from "@/lib/document/validate";

/** Places a signature-validated image as a centred `ImageObject` marked `replaced: true`, reusing the `applyImageEdits` bake path. */

/** Fraction of the page a freshly inserted image is allowed to span. */
const MAX_PAGE_RATIO = 0.5;

/** Encodes raw bytes as a base64 data URL for the overlay preview and re-embed. */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function loadNaturalSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("That image could not be decoded"));
    img.src = dataUrl;
  });
}

export async function insertImageFromFile(file: File): Promise<void> {
  const store = useEditorStore.getState();
  if (!store.pdfBytes || !store.pdfDocProxy) {
    store.setStatus("Open a PDF before inserting an image");
    return;
  }

  try {
    // Content check at the boundary: the extension and MIME type are not evidence.
    const { bytes, mime } = await readImageFile(file);
    const dataUrl = bytesToDataUrl(bytes, mime);
    const natural = await loadNaturalSize(dataUrl);

    const pageCount = store.pageCount || 1;
    const pageIndex = Math.max(0, Math.min(store.currentPage - 1, pageCount - 1));
    const proxy = store.pdfDocProxy as {
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
      }>;
    };
    // Scale 1 gives the page box in PDF points, the same space ImageObject uses.
    const viewport = (await proxy.getPage(pageIndex + 1)).getViewport({ scale: 1 });

    const factor = Math.min(
      (viewport.width * MAX_PAGE_RATIO) / natural.width,
      (viewport.height * MAX_PAGE_RATIO) / natural.height
    );
    const width = natural.width * factor;
    const height = natural.height * factor;

    const image: ImageObject = {
      id: `img-insert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pageIndex,
      x: (viewport.width - width) / 2,
      y: (viewport.height - height) / 2,
      width,
      height,
      rotation: 0,
      dataUrl,
      // No region exists in the file to clear; `replaced` marks the pixels as pending so the save pass embeds them.
      replaced: true,
    };

    store.addImage(image);
    store.setTool("image-edit");
    store.setCurrentView("viewer");
    store.setStatus("Image inserted — drag to position, then Save to embed");
  } catch (e) {
    useEditorStore
      .getState()
      .setStatus(e instanceof Error ? e.message : "That image could not be read");
  }
}

/** Opens a file picker limited to the formats the embedder accepts. */
export function pickImageToInsert(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg";
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void insertImageFromFile(file);
  };
  input.click();
}

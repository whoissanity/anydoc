import type { AttachmentItem, LayerItem, OutlineItem } from "@/lib/types";
import { safeDownloadName } from "@/lib/security/filename";

/** Bound the parser's memory: 100 MB is far past any realistic PDF. */
const MAX_PDF_BYTES = 100 * 1024 * 1024;
/** A malformed PDF must not pin a tab forever on a promise that never settles. */
const PARSE_TIMEOUT_MS = 60_000;

export async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    // Bundle PDF.js's own worker rather than execute CDN code at runtime (a hijacked CDN runs in our origin; rule 4).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
  return pdfjs;
}

export async function loadPdfDocument(data: ArrayBuffer | Uint8Array) {
  const pdfjs = await getPdfjs();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (bytes.byteLength === 0) throw new Error("This file is empty");
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("This PDF is larger than the 100 MB limit");
  }

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    // cmaps vendored under /public/vendor/pdfjs: CJK documents must resolve character maps with no network.
    cMapUrl: `${window.location.origin}/vendor/pdfjs/cmaps/`,
    cMapPacked: true,
    enableXfa: true,
    // PDF.js would eval glyph/font programs when on; a document must never reach eval()/new Function.
    isEvalSupported: false,
    stopAtErrors: false,
    disableAutoFetch: true,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Timed out while parsing this PDF — the file may be malformed")),
        PARSE_TIMEOUT_MS
      );
    });
    return await Promise.race([loadingTask.promise, timeout]);
  } catch (error) {
    // Tear the worker down so a hostile document cannot keep running.
    void loadingTask.destroy().catch(() => undefined);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function extractOutline(doc: {
  getOutline: () => Promise<Array<{ title: string; dest: unknown; items?: unknown[] }> | null>;
  getPageIndex: (ref: unknown) => Promise<number>;
}): Promise<OutlineItem[]> {
  const outline = await doc.getOutline();
  if (!outline) return [];

  const mapItems = async (
    items: Array<{ title: string; dest: unknown; items?: unknown[] }>
  ): Promise<OutlineItem[]> => {
    const result: OutlineItem[] = [];
    for (const item of items) {
      let pageIndex: number | null = null;
      try {
        if (typeof item.dest === "string") {
          // named dest — skip detailed resolve for v1
          pageIndex = 0;
        } else if (Array.isArray(item.dest) && item.dest[0]) {
          pageIndex = await doc.getPageIndex(item.dest[0]);
        }
      } catch {
        pageIndex = null;
      }
      result.push({
        title: item.title,
        pageIndex,
        items: item.items
          ? await mapItems(item.items as Array<{ title: string; dest: unknown; items?: unknown[] }>)
          : [],
      });
    }
    return result;
  };

  return mapItems(outline);
}

export async function extractAttachments(doc: {
  getAttachments?: () => Promise<Record<string, { filename: string; content: Uint8Array; description?: string }> | null>;
}): Promise<AttachmentItem[]> {
  if (!doc.getAttachments) return [];
  try {
    const atts = await doc.getAttachments();
    if (!atts) return [];
    return Object.values(atts).map((a) => ({
      filename: a.filename,
      description: a.description,
      content: a.content,
    }));
  } catch {
    return [];
  }
}

export async function extractLayers(doc: {
  getOptionalContentConfig?: () => Promise<{
    getGroups: () => Map<string, { name?: string; visible?: boolean }> | null;
  } | null>;
}): Promise<LayerItem[]> {
  if (!doc.getOptionalContentConfig) return [];
  try {
    const config = await doc.getOptionalContentConfig();
    if (!config) return [];
    const groups = config.getGroups?.();
    if (!groups) return [];
    const layers: LayerItem[] = [];
    groups.forEach((group, id) => {
      layers.push({
        id,
        name: group.name || id,
        visible: group.visible !== false,
      });
    });
    return layers;
  } catch {
    return [];
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeDownloadName(filename, "document");
  a.rel = "noopener";
  a.style.display = "none";
  // Firefox/Safari need the anchor in the document, and the object URL must outlive the click or the save aborts.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

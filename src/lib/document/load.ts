import type { AttachmentItem, LayerItem, OutlineItem } from "@/lib/types";
import type { CommentThread } from "@/lib/security/pdf-security";
import { splitCommentReplies } from "@/lib/security/comments";
import { safeDownloadName } from "@/lib/security/filename";
import { isDetachedBytes } from "@/lib/document/validate";
import { createTrackedObjectUrl, revokeTrackedObjectUrl } from "@/lib/storage/object-urls";

/** Bound the parser's memory: 100 MB is far past any realistic PDF. */
const MAX_PDF_BYTES = 100 * 1024 * 1024;
/** A malformed PDF must not pin a tab forever on a promise that never settles. */
const PARSE_TIMEOUT_MS = 60_000;

/** Raised when a PDF is encrypted and no usable password was supplied. */
export class PdfPasswordRequiredError extends Error {
  readonly code: 1 | 2;
  constructor(code: 1 | 2) {
    super(code === 2 ? "Incorrect password" : "Password required");
    this.name = "PasswordException";
    this.code = code;
  }
}

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

export async function loadPdfDocument(
  data: ArrayBuffer | Uint8Array,
  options: { password?: string } = {}
) {
  const pdfjs = await getPdfjs();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (isDetachedBytes(bytes)) {
    throw new Error("This file is empty or detached — reopen the file");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("This PDF is larger than the 100 MB limit");
  }

  let transfer: Uint8Array;
  try {
    transfer = bytes.slice();
  } catch {
    throw new Error("This file is empty or detached — reopen the file");
  }

  const vendorBase = `${window.location.origin}/vendor/pdfjs`;
  const loadingTask = pdfjs.getDocument({
    data: transfer,
    // cmaps + standard-font metrics are vendored under /public/vendor/pdfjs —
    // never leave these unconfigured (PDF.js would otherwise probe CDNs).
    cMapUrl: `${vendorBase}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${vendorBase}/standard_fonts/`,
    enableXfa: true,
    // PDF.js would eval glyph/font programs when on; a document must never reach eval()/new Function.
    isEvalSupported: false,
    stopAtErrors: false,
    disableAutoFetch: true,
    password: options.password,
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
    const code = (error as { code?: number }).code;
    if ((error as { name?: string }).name === "PasswordException" || code === 1 || code === 2) {
      const supplied = typeof options.password === "string" && options.password.length > 0;
      throw new PdfPasswordRequiredError(supplied ? 2 : 1);
    }
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

interface PdfAnnotationLike {
  annotationType?: number;
  contentsObj?: { str?: string };
  titleObj?: { str?: string };
  date?: string;
  id?: string;
}

const COMMENT_TYPES: Record<number, CommentThread["type"]> = {
  1: "sticky",
  3: "callout",
  9: "highlight",
  10: "underline",
  12: "strikethrough",
};

const COMMENT_EXTRACTION_BUDGET_MS = 10_000;
const COMMENT_EXTRACTION_MAX_THREADS = 2_000;
const COMMENT_PAGE_TIMEOUT_MS = 2_000;

function annotationsWithTimeout(page: {
  getAnnotations: () => Promise<PdfAnnotationLike[]>;
}): Promise<PdfAnnotationLike[]> {
  const pending = page.getAnnotations();
  // The losing promise must not surface as an unhandled rejection after the race settles.
  pending.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Annotation read timed out")),
      COMMENT_PAGE_TIMEOUT_MS
    );
  });
  return Promise.race([pending, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Reads text notes and markup annotations from a PDF.js document. Replies written by
 * this app are encoded in the note contents; foreign comments are imported as-is.
 * A large document is capped so a hostile or enormous file cannot stall the editor.
 */
export async function extractComments(doc: {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getAnnotations: () => Promise<PdfAnnotationLike[]>;
  }>;
}): Promise<CommentThread[]> {
  const comments: CommentThread[] = [];
  const startedAt = Date.now();

  for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex += 1) {
    if (comments.length >= COMMENT_EXTRACTION_MAX_THREADS) break;
    if (Date.now() - startedAt > COMMENT_EXTRACTION_BUDGET_MS) break;

    let page: { getAnnotations: () => Promise<PdfAnnotationLike[]> };
    try {
      page = await doc.getPage(pageIndex + 1);
    } catch {
      continue;
    }

    let annotations: PdfAnnotationLike[];
    try {
      annotations = await annotationsWithTimeout(page);
    } catch {
      continue;
    }

    for (const annotation of annotations) {
      const type = COMMENT_TYPES[annotation.annotationType ?? -1];
      if (!type) continue;

      const contents = annotation.contentsObj?.str ?? "";
      const { text, replies } = splitCommentReplies(contents);
      if (!text.trim() && replies.length === 0) continue;

      comments.push({
        id: annotation.id || `pdf-comment-${pageIndex + 1}-${comments.length + 1}`,
        author: annotation.titleObj?.str || "Unknown",
        date: annotation.date || new Date().toISOString(),
        pageIndex,
        text,
        type,
        status: "Open",
        replies,
      });
    }
  }

  return comments;
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
  // Tracked so "delete draft now" can release any object URL still pinning this blob.
  const url = createTrackedObjectUrl(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeDownloadName(filename, "document");
  a.rel = "noopener";
  a.style.display = "none";
  // Firefox/Safari need the anchor in the document, and the object URL must outlive the click or the save aborts.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => revokeTrackedObjectUrl(url), 60_000);
}

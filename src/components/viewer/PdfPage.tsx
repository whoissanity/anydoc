"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditorStore } from "@/store/editor-store";
import {
  MAX_TEXT_FONT_SIZE,
  MIN_TEXT_FONT_SIZE,
  TEXT_FONT_CHOICES,
  mapPdfFontToCss,
} from "@/lib/text/fonts";
import { ensureScriptsForText } from "@/lib/fonts/scripts";
import { resolveFont } from "@/lib/fonts/resolve";
import { USER_FONTS_CHANGED_EVENT } from "@/lib/fonts/registered-user";
import { applyTextEdit } from "@/lib/edit/edit-engine";
import { reloadFromBytes } from "@/lib/document/document-service";
import { withRenderLock, renderPageWithTimeout } from "@/lib/document/render-queue";
import { createFormFieldId } from "@/lib/edit/forms";
import { Highlighter, Minus, Plus, Strikethrough, Underline } from "lucide-react";
import type {
  AnnotationItem,
  FormFieldDraft,
  ImageObject,
  StickyNoteItem,
  TextEditSession,
  TextObject,
} from "@/lib/types";
import { newId } from "@/lib/id";
import { isRtl } from "@/lib/text/bidi";
import { groupTextBlocks, type TextBlockBox } from "@/lib/text/text-blocks";

function isMarkupTool(tool: string) {
  return tool === "highlight" || tool === "underline" || tool === "strikethrough";
}

// Highlight gets alpha; underline and strikethrough are solid.
function renderColor(type: AnnotationItem["type"], hex: string, opacity = 0.42): string {
  if (type === "highlight") {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return hex;
}

const FORM_TOOL_TYPES: Record<string, FormFieldDraft["type"]> = {
  "form-text": "text",
  "form-checkbox": "checkbox",
  "form-radio": "radio",
  "form-dropdown": "dropdown",
  "form-signature": "signature",
  "form-submit": "submit",
};

/**
 * Approximates the colour of existing text by sampling the rendered canvas inside the
 * span's box. PDF.js doesn't expose text colour in getTextContent(), so the pixels are
 * the only source; falls back to near-black when the box is blank.
 */
/**
 * Whether a text run uses a bold face. PDF.js hands back subset ids ("g_d0_f1") as the
 * font name, so the loaded font face is the real source; the id itself is only a fallback.
 */
function isSpanBold(
  page: {
    commonObjs?: { has?: (id: string) => boolean; get?: (id: string) => unknown };
  },
  fontName: string | undefined
): boolean {
  if (!fontName) return false;
  try {
    if (page.commonObjs?.has?.(fontName)) {
      const face = page.commonObjs.get?.(fontName) as
        | { bold?: boolean; black?: boolean; name?: string; fontFamily?: string }
        | undefined;
      if (face) {
        if (face.bold || face.black) return true;
        if (/bold|black|heavy|semibold/i.test(face.name || "")) return true;
        if (/bold|black|heavy|semibold/i.test(face.fontFamily || "")) return true;
        return false;
      }
    }
  } catch {
    // Fall through to the name check below.
  }
  return /bold|black|heavy|semibold/i.test(fontName);
}

function resolveSpanFontFamily(
  page: {
    commonObjs?: { has?: (id: string) => boolean; get?: (id: string) => unknown };
  },
  fontName: string | undefined
): string {
  if (!fontName) return mapPdfFontToCss(fontName);
  try {
    if (page.commonObjs?.has?.(fontName)) {
      const face = page.commonObjs.get?.(fontName) as
        | { name?: string; fontFamily?: string }
        | undefined;
      const resolved = face?.name || face?.fontFamily;
      // PDF.js reports generic CSS families for substituted faces; keep the PDF name
      // so the editor shows serif/mono rather than silently turning everything sans.
      if (resolved && !/^(sans-serif|serif|monospace|cursive|fantasy)$/i.test(resolved)) {
        return mapPdfFontToCss(resolved);
      }
    }
  } catch {
    // Fall through to the raw PDF font id.
  }
  return mapPdfFontToCss(fontName);
}

function sampleTextColor(
  canvas: HTMLCanvasElement | null,
  left: number,
  top: number,
  width: number,
  height: number
): string {
  const fallback = "#111111";
  const ctx = canvas?.getContext("2d");
  if (!ctx) return fallback;
  try {
    const x = Math.max(0, Math.floor(left) + 1);
    const y = Math.max(0, Math.floor(top) + 1);
    const w = Math.min(Math.floor(width) - 2, canvas!.width - x);
    const h = Math.min(Math.floor(height) - 2, canvas!.height - y);
    if (w < 2 || h < 2) return fallback;
    const data = ctx.getImageData(x, y, w, h).data;
    const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Skip paper/background pixels; glyph pixels are the dark minority.
      if (0.299 * r + 0.587 * g + 0.114 * b > 200) continue;
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
      buckets.set(key, bucket);
    }
    let best: { r: number; g: number; b: number; n: number } | null = null;
    for (const bucket of buckets.values()) {
      if (!best || bucket.n > best.n) best = bucket;
    }
    if (!best) return fallback;
    const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
    return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
  } catch {
    return fallback;
  }
}

const FORM_TOOL_DEFAULTS: Record<string, { w: number; h: number }> = {
  text: { w: 160, h: 22 },
  checkbox: { w: 16, h: 16 },
  radio: { w: 16, h: 16 },
  dropdown: { w: 140, h: 22 },
  signature: { w: 180, h: 40 },
  submit: { w: 100, h: 28 },
};

const DEFAULT_TEXT_FONT = TEXT_FONT_CHOICES[0]!.value;

const MIN_FONT_SIZE = MIN_TEXT_FONT_SIZE;
const MAX_FONT_SIZE = MAX_TEXT_FONT_SIZE;
const MIN_LINE_HEIGHT = 1;
const MAX_LINE_HEIGHT = 3;

// Tools whose object is drawn by click-dragging a box (a plain click falls back to a default size).
function isDrawToCreate(tool: string) {
  return tool === "text-add" || tool.startsWith("form-");
}

interface Props {
  pageNumber: number;
  scale: number;
  widthHint?: number;
  /** Reports the page's real box so virtualized placeholders can reserve the right height. */
  onMeasure?: (pageNumber: number, width: number, height: number) => void;
}

/** A hostile page can declare a huge MediaBox; cap the bitmap, not the layout. */
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_CANVAS_DIMENSION = 16_384;
const RENDER_TIMEOUT_MS = 15_000;

export function PdfPage({ pageNumber, scale, onMeasure }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Local textarea state avoids a store re-render on each keystroke.
  const [localText, setLocalText] = useState("");
  const editingSpansRef = useRef<HTMLElement[]>([]);

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  }>({ active: false, startX: 0, startY: 0, curX: 0, curY: 0 });
  const [dragRect, setDragRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Tool that started a draw-to-create drag (text / form tools) and the toolbar node so
  // interacting with the text style controls doesn't blur-commit the in-progress text.
  const createToolRef = useRef<string | null>(null);
  const styleBarRef = useRef<HTMLDivElement>(null);
  const lastSessionIdRef = useRef<string | null>(null);

  const imageDragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    corner: "nw" | "ne" | "se" | "sw";
    startX: number;
    startY: number;
    box: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const [selectionMenu, setSelectionMenu] = useState<{
    left: number;
    top: number;
    range: Range;
  } | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const drawPathRef = useRef<string>("");
  const isDrawingRef = useRef(false);

  // A press that ends a text session is followed by a blur-commit; its trailing click must
  // not fall through to the canvas' create handler and spawn a second text box.
  const blockTextCreateRef = useRef(false);

  const fieldDragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    corner: "nw" | "ne" | "se" | "sw";
    startX: number;
    startY: number;
    box: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const textDragRef = useRef<{
    id: string;
    mode: "move" | "resize" | "rotate";
    corner: "nw" | "ne" | "se" | "sw";
    startX: number;
    startY: number;
    box: { x: number; y: number; width: number; height: number };
    centerX: number;
    centerY: number;
  } | null>(null);

<<<<<<< HEAD
  const stickyNoteDragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    box: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const [selectedStickyNoteId, setSelectedStickyNoteId] = useState<string | null>(null);
  const [editingStickyNoteId, setEditingStickyNoteId] = useState<string | null>(null);
  const [stickyNoteText, setStickyNoteText] = useState("");

=======
>>>>>>> origin/v0/anydoc-design-system
  const pdfDocProxy = useEditorStore((s) => s.pdfDocProxy);
  const tool = useEditorStore((s) => s.tool);
  const formFields = useEditorStore((s) => s.formFields);
  const selectedFormId = useEditorStore((s) => s.selectedFormId);
  const images = useEditorStore((s) => s.images);
  const selectedImageId = useEditorStore((s) => s.selectedImageId);
  const textObjects = useEditorStore((s) => s.textObjects);
  const selectedTextId = useEditorStore((s) => s.selectedTextId);
  const layers = useEditorStore((s) => s.layers);
  const searchQuery = useEditorStore((s) => s.searchQuery);
  const optionalContentConfig = useEditorStore((s) => s.optionalContentConfig);
  const textEdit = useEditorStore((s) => s.textEdit);
  const [fontNotice, setFontNotice] = useState<string | null>(null);
  const [fontRevision, setFontRevision] = useState(0);

  useEffect(() => {
    const onFontsChanged = () => setFontRevision((value) => value + 1);
    window.addEventListener(USER_FONTS_CHANGED_EVENT, onFontsChanged);
    return () => window.removeEventListener(USER_FONTS_CHANGED_EVENT, onFontsChanged);
  }, []);
  const annotations = useEditorStore((s) => s.annotations);
<<<<<<< HEAD
  const stickyNotes = useEditorStore((s) => s.stickyNotes);
=======
>>>>>>> origin/v0/anydoc-design-system
  const annotColor = useEditorStore((s) => s.annotColor);
  const underlineColor = useEditorStore((s) => s.underlineColor);
  const strikeColor = useEditorStore((s) => s.strikeColor);
  const markupOpacity = useEditorStore((s) => s.markupOpacity);
<<<<<<< HEAD
  const drawColor = useEditorStore((s) => s.drawColor);
=======
>>>>>>> origin/v0/anydoc-design-system
  const redactions = useEditorStore((s) => s.redactions);
  const ocrPage = useEditorStore((s) =>
    s.ocrPages.find((p) => p.pageIndex === pageNumber - 1)
  );

  const pageFields = formFields.filter((f) => f.pageIndex === pageNumber - 1);
  const pageImages = images.filter((i) => i.pageIndex === pageNumber - 1);
  const pageTextObjects = textObjects.filter((t) => t.pageIndex === pageNumber - 1);
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageNumber - 1);
<<<<<<< HEAD
  const pageStickyNotes = stickyNotes.filter((n) => n.pageIndex === pageNumber - 1);
=======
>>>>>>> origin/v0/anydoc-design-system
  const pageRedactions = redactions.filter((r) => r.pageIndex === pageNumber - 1);

  // Seed the local value only when a *different* session starts. Keyed on the session id so
  // live font/size/spacing tweaks don't clobber what the user has already typed.
  useEffect(() => {
    if (!textEdit || textEdit.pageIndex !== pageNumber - 1) return;
    if (lastSessionIdRef.current === textEdit.id) return;
    lastSessionIdRef.current = textEdit.id;
    setLocalText(textEdit.text);
  }, [textEdit, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!pdfDocProxy || !canvasRef.current) return;
      setRendering(true);
      const doc = pdfDocProxy as {
        getPage: (n: number) => Promise<{
          getViewport: (opts: { scale: number }) => { width: number; height: number };
          render: (opts: unknown) => { promise: Promise<void>; cancel: () => void };
          commonObjs?: { has?: (id: string) => boolean; get?: (id: string) => unknown };
          getTextContent: () => Promise<{
            items: Array<{
              str: string;
              transform: number[];
              width: number;
              height: number;
              fontName?: string;
            }>;
          }>;
        }>;
      };
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });

      // A hostile MediaBox can be effectively unbounded. Refuse to lay out a million-pixel
      // page box (even an empty one) instead of handing the browser an impossible size.
      const MAX_PAGE_BOX = 20_000;
      if (
        !Number.isFinite(viewport.width) ||
        !Number.isFinite(viewport.height) ||
        viewport.width <= 0 ||
        viewport.height <= 0 ||
        viewport.width > MAX_PAGE_BOX ||
        viewport.height > MAX_PAGE_BOX
      ) {
        setRendering(false);
        setSize({ w: 600, h: 800 });
        onMeasure?.(pageNumber, 600, 800);
        setRenderError("This page is too large to display.");
        return;
      }

      // The layout/overlay space stays at the requested zoom; only the bitmap is capped so a
      // hostile MediaBox cannot allocate a 1,000,000 x 1,000,000 canvas.
      const pixels = viewport.width * viewport.height;
      const ratio = Math.min(
        1,
        Math.sqrt(MAX_CANVAS_PIXELS / pixels),
        MAX_CANVAS_DIMENSION / viewport.width,
        MAX_CANVAS_DIMENSION / viewport.height
      );
      const renderViewport =
        ratio < 1 ? page.getViewport({ scale: scale * ratio }) : viewport;

      const canvas = canvasRef.current;
      if (!canvas) return;
      setSize({ w: viewport.width, h: viewport.height });
      onMeasure?.(pageNumber, viewport.width, viewport.height);

      // Paint into an offscreen buffer first. Resizing the visible canvas clears its bitmap,
      // so drawing straight into it left the page white for as long as PDF.js took to
      // repaint (very visible after every text commit). Blitting in one step keeps the old
      // page on screen until the new one is complete.
      const buffer = document.createElement("canvas");
      buffer.width = Math.max(1, Math.floor(renderViewport.width));
      buffer.height = Math.max(1, Math.floor(renderViewport.height));
      const bufferCtx = buffer.getContext("2d");
      if (!bufferCtx) return;

      try {
        await withRenderLock(() =>
          renderPageWithTimeout(
            page,
            {
              canvasContext: bufferCtx,
              viewport: renderViewport,
              optionalContentConfigPromise: optionalContentConfig
                ? Promise.resolve(optionalContentConfig as never)
                : undefined,
            },
            RENDER_TIMEOUT_MS,
            `Page ${pageNumber} took too long to render. Try zooming out.`
          )
        );
      } catch (error) {
        if (cancelled) return;
        setRendering(false);
        setRenderError(
          error instanceof Error && error.message
            ? error.message
            : "This page could not be rendered."
        );
        return;
      }
      if (cancelled) return;

      canvas.width = buffer.width;
      canvas.height = buffer.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.getContext("2d")?.drawImage(buffer, 0, 0);
      useEditorStore.getState().markPageRendered();

      // Text spans are positioned in the full-size layout space, while the bitmap may be
      // lower resolution. Sample the bitmap through that same ratio.
      const sampleX = viewport.width > 0 ? canvas.width / viewport.width : 1;
      const sampleY = viewport.height > 0 ? canvas.height / viewport.height : 1;

      const textContent = await page.getTextContent();
      // Load only the script packs this page actually needs; registered @font-face
      // families are already part of every substitute stack.
      void ensureScriptsForText(
        textContent.items
          .filter((item): item is typeof item & { str: string } => "str" in item && !!item.str)
          .map((item) => item.str)
          .join(" ")
          .slice(0, 50_000)
      );
      // A superseded pass must not touch the layer or it repaints stale spans at the old zoom.
      if (cancelled) return;
      const layer = textLayerRef.current;
      if (layer) {
        layer.style.width = `${viewport.width}px`;
        layer.style.height = `${viewport.height}px`;
        const fragment = document.createDocumentFragment();
        const placed: Array<{ span: HTMLSpanElement; width: number }> = [];
        // Rebuild logical paragraphs from the glyph runs, so one click selects the
        // sentence/paragraph instead of the single style run under the pointer.
        const pageHeightPts = viewport.height / scale;
        const blocks = groupTextBlocks(textContent.items, {
          pageHeight: pageHeightPts,
          isBold: (fontName) => isSpanBold(page, fontName),
        });
        const blockByItem = new Map<number, TextBlockBox>();
        for (const block of blocks) {
          for (const itemIndex of block.itemIndexes) blockByItem.set(itemIndex, block);
        }
        textContent.items.forEach((item, itemIndex) => {
          if (!("str" in item) || !item.str) return;
          const block = blockByItem.get(itemIndex);
          const tx = item.transform;
          const span = document.createElement("span");
          const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
          const left = tx[4] * scale;
          const top = viewport.height - tx[5] * scale - fontHeight * scale;
          // Match the source run when it is opened for editing.
          const isBold = isSpanBold(page, item.fontName);
          const spanFamily = resolveSpanFontFamily(page, item.fontName);
          span.textContent = item.str;
          const query = searchQuery.trim();
          if (query && item.str.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
            span.classList.add("search-hit");
          }
          span.style.left = `${left}px`;
          span.style.top = `${top}px`;
          span.style.fontSize = `${fontHeight * scale}px`;
          span.style.fontFamily = spanFamily;
          span.dataset.x = String(tx[4]);
          span.dataset.y = String(viewport.height / scale - tx[5]);
          span.dataset.fontSize = String(fontHeight);
          span.dataset.fontFamily = spanFamily;
          span.dataset.width = String(item.width || fontHeight * item.str.length * 0.5);
          span.dataset.height = String(fontHeight);
          if (block) span.dataset.block = String(block.id);

          span.addEventListener("click", (e) => {
            const currentTool = useEditorStore.getState().tool;
            // The text tool is contextual: clicking existing text edits it instead of
            // starting a new box (only clicks on empty canvas create text).
            if (currentTool !== "text-edit" && currentTool !== "text-add") return;
            e.stopPropagation();

            // Hide every span belonging to the paragraph/tile, not just the run under
            // the pointer, so the textarea replaces the whole block cleanly.
            const blockSpans = block
              ? Array.from(
                  layer?.querySelectorAll<HTMLElement>(`span[data-block="${block.id}"]`) ?? []
                )
              : [];
            for (const node of blockSpans) node.style.opacity = "0";
            if (!blockSpans.length) span.style.opacity = "0";
            editingSpansRef.current = blockSpans.length ? blockSpans : [span];

            // Inherit the source block's exact geometry and typography. Nothing is
            // rounded or inflated here: the session must look identical to the page
            // until the user touches a style control.
            const sourceX = block ? block.x : tx[4];
            const sourceY = block
              ? block.y
              : viewport.height / scale - tx[5] - fontHeight;
            const sourceWidth = block ? block.width : item.width || fontHeight * 0.8;
            const sourceHeight = block ? block.height : fontHeight * 1.2;
            const sourceSize = block ? block.fontSize : fontHeight;
            useEditorStore.getState().setTextEdit({
              id: newId(),
              pageIndex: pageNumber - 1,
              text: block ? block.text : item.str,
              x: sourceX,
              y: sourceY,
              width: Math.max(sourceWidth, 1),
              height: Math.max(sourceHeight, sourceSize),
              fontSize: Math.max(sourceSize, 0.5),
              fontFamily: block ? resolveSpanFontFamily(page, block.fontName) : spanFamily,
              sourceFontName: block?.fontName,
              lineHeight: block?.lineHeight ?? 1.25,
              bold: block ? block.bold : isBold,
              color: sampleTextColor(
                canvas,
                sourceX * scale * sampleX,
                sourceY * scale * sampleY,
                Math.max(sourceWidth * scale, 2) * sampleX,
                Math.max(sourceHeight * scale, 2) * sampleY
              ),
              // Editing existing text: the bake step must cover the original glyphs first.
              eraseUnderlay: true,
              preserveLines: true,
            });
          });
          placed.push({ span, width: (item.width || 0) * scale });
          fragment.appendChild(span);
        });
        // One swap, so the layer never holds spans from two passes at once.
        layer.replaceChildren(fragment);
        // Stretch each box to the run's real width: substitute fonts rarely match its advance.
        for (const { span, width } of placed) {
          const actual = span.getBoundingClientRect().width;
          if (width > 0.5 && actual > 0.5) {
            const ratio = width / actual;
            if (Number.isFinite(ratio) && ratio > 0.05 && ratio < 20) {
              span.style.transform = `scaleX(${ratio})`;
            }
          }
        }
      }
      setRendering(false);
    }
    render().catch(() => {
      if (cancelled) return;
      setRendering(false);
      setRenderError("This page could not be rendered.");
    });
    return () => {
      cancelled = true;
      // Stop the spinner on an abandoned pass; the replacement pass re-arms its own.
      setRendering(false);
    };
  }, [
    pdfDocProxy,
    pageNumber,
    scale,
    layers,
    optionalContentConfig,
    searchQuery,
    onMeasure,
    fontRevision,
  ]);

  const openTextObject = useCallback((object: TextObject) => {
    const store = useEditorStore.getState();
    store.setSelectedTextId(object.id);
    store.setTextEdit({
      id: newId(),
      objectId: object.id,
      pageIndex: object.pageIndex,
      text: object.text,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      fontSize: object.fontSize,
      fontFamily: object.fontFamily,
      color: object.color,
      lineHeight: object.lineHeight,
      bold: object.bold,
      underline: object.underline,
      strikethrough: object.strikethrough,
      rotation: object.rotation,
    });
  }, []);

  const sourceFontName = textEdit?.sourceFontName;
  const editFontFamily = textEdit?.fontFamily;
  const editFontBold = textEdit?.bold;
  useEffect(() => {
    let active = true;
    if (!editFontFamily) {
      setFontNotice(null);
      return;
    }
    void resolveFont({
      name: sourceFontName ?? editFontFamily,
      bold: editFontBold,
    }).then((match) => {
      if (active) setFontNotice(match.notice ?? null);
    });
    return () => {
      active = false;
    };
  }, [sourceFontName, editFontFamily, editFontBold]);

  const commitTextEdit = useCallback(async () => {
    const session = useEditorStore.getState().textEdit;
    const bytes = useEditorStore.getState().pdfBytes;
    if (!session || !bytes) {
      // text-add with no session: nothing to commit
      useEditorStore.getState().setTextEdit(null);
      return;
    }
    for (const node of editingSpansRef.current) node.style.opacity = "";
    editingSpansRef.current = [];
    // An empty *new* text box has nothing to draw; dropping it avoids a needless re-bake.
    if (!session.eraseUnderlay && !localText.trim()) {
      if (session.objectId) {
        useEditorStore.getState().removeTextObject(session.objectId);
      }
      useEditorStore.getState().setTextEdit(null);
      return;
    }
    // Use the locally-tracked text value (not from store, to avoid lag)
    const committed = { ...session, text: localText };
    // Resolve after the commit so the UI stays synchronous; the async lookup also
    // checks user fonts before deciding a last-resort substitution happened.
    const surfaceSubstitution = () => {
      void resolveFont({
        name: session.sourceFontName ?? session.fontFamily,
        bold: session.bold,
      }).then((match) => {
        if (match.notice) {
          useEditorStore.getState().setStatus(`Text updated — ${match.notice}`);
        }
      });
    };

    // Text placed by this editor stays movable until the document is saved.
    if (session.objectId) {
      const store = useEditorStore.getState();
      const existing = store.textObjects.find((t) => t.id === session.objectId);
      const fields = {
        pageIndex: committed.pageIndex,
        text: committed.text,
        x: committed.x,
        y: committed.y,
        width: committed.width,
        height: committed.height,
        fontSize: committed.fontSize,
        fontFamily: committed.fontFamily,
        color: committed.color,
        lineHeight: committed.lineHeight,
        bold: committed.bold,
        underline: committed.underline,
        strikethrough: committed.strikethrough,
        rotation: committed.rotation ?? existing?.rotation ?? 0,
      };
      if (existing) store.updateTextObject(existing.id, fields);
      else store.addTextObject({ id: session.objectId, ...fields });
      store.setTextEdit(null);
      store.setStatus("Text updated");
      surfaceSubstitution();
      return;
    }

    // Existing PDF glyphs are part of the page, so the edit is baked immediately.
    useEditorStore.getState().setStatus("Applying text edit…");
    useEditorStore.getState().setTextEdit(null);
    const next = await applyTextEdit(bytes, committed);
    await reloadFromBytes(next);
    useEditorStore.getState().setStatus("Text updated");
    surfaceSubstitution();
  }, [localText]);

  // Live-tweak the open session (font, size, spacing). The session id is unchanged, so the
  // sync effect above keeps whatever the user has typed.
  const patchSession = useCallback((patch: Partial<TextEditSession>) => {
    const session = useEditorStore.getState().textEdit;
    if (!session) return;
    useEditorStore.getState().setTextEdit({ ...session, ...patch });
  }, []);

  // Markup snaps to real text selection (PDF.js line boxes), so it can't land in empty space.
  const rectsFromRange = useCallback(
    (range: Range): AnnotationItem["rects"] => {
      const layer = textLayerRef.current;
      const container = containerRef.current;
      if (!layer || !container) return [];

      const node = range.commonAncestorContainer;
      const element =
        node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
      // Accept selections from the PDF text or OCR layer, never chrome outside this page.
      if (!element || !container.contains(element)) return [];

      const containerRect = container.getBoundingClientRect();
      const rects: AnnotationItem["rects"] = [];

      for (const clientRect of Array.from(range.getClientRects())) {
        const left = Math.max(clientRect.left, containerRect.left);
        const right = Math.min(clientRect.right, containerRect.right);
        const top = Math.max(clientRect.top, containerRect.top);
        const bottom = Math.min(clientRect.bottom, containerRect.bottom);
        if (right - left < 1 || bottom - top < 1) continue;
        rects.push({
          x: (left - containerRect.left) / scale,
          y: (top - containerRect.top) / scale,
          width: (right - left) / scale,
          height: (bottom - top) / scale,
          lineY: (bottom - containerRect.top) / scale,
        });
      }

      return rects;
    },
    [scale]
  );

  const addMarkup = useCallback(
    (type: AnnotationItem["type"], rects: AnnotationItem["rects"]) => {
      if (!rects.length) return;
      const color =
        type === "highlight"
          ? annotColor
          : type === "underline"
          ? underlineColor
          : strikeColor;
      const store = useEditorStore.getState();
      store.addAnnotation({
        id: newId(),
        type,
        pageIndex: pageNumber - 1,
        color,
        opacity: type === "highlight" ? markupOpacity : 1,
        scale,
        rects,
      });
      store.setStatus(`${type.charAt(0).toUpperCase() + type.slice(1)} applied to selection`);
      window.getSelection()?.removeAllRanges();
      savedRangeRef.current = null;
      setSelectionMenu(null);
    },
    [annotColor, underlineColor, strikeColor, markupOpacity, pageNumber, scale]
  );

  // Remember the range so a toolbar click can style text that was selected first.
  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectionMenu(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!rectsFromRange(range).length) {
        setSelectionMenu(null);
        return;
      }
      savedRangeRef.current = range.cloneRange();
      const box = range.getBoundingClientRect();
      setSelectionMenu({
        left: box.left + box.width / 2,
        top: box.top,
        range: range.cloneRange(),
      });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [rectsFromRange]);

  // Workflow 2: text selected first, then a markup tool is clicked.
  useEffect(() => {
    if (!isMarkupTool(tool)) return;
    const range = savedRangeRef.current;
    if (!range) return;
    const rects = rectsFromRange(range);
    if (rects.length) addMarkup(tool as AnnotationItem["type"], rects);
  }, [tool, rectsFromRange, addMarkup]);

  // Workflow 1: tool chosen first — apply when the pointer is released on the page.
  useEffect(() => {
    const onSelectionEnd = (event: PointerEvent) => {
      const container = containerRef.current;
      const target = event.target as Node | null;
      if (!container || !target || !container.contains(target)) return;
      if (!isMarkupTool(useEditorStore.getState().tool)) return;
      window.setTimeout(() => {
        const active = useEditorStore.getState().tool;
        if (!isMarkupTool(active)) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
        const rects = rectsFromRange(selection.getRangeAt(0));
        if (rects.length) addMarkup(active as AnnotationItem["type"], rects);
      }, 0);
    };
    document.addEventListener("pointerup", onSelectionEnd);
    return () => document.removeEventListener("pointerup", onSelectionEnd);
  }, [rectsFromRange, addMarkup]);

  // Image and form-field move/resize updates the store live; edits bake into the PDF on save.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = imageDragRef.current;
      if (drag) {
        const dx = (event.clientX - drag.startX) / scale;
        const dy = (event.clientY - drag.startY) / scale;
        let { x, y, width, height } = drag.box;
        const minSize = 12;

        if (drag.mode === "move") {
          x += dx;
          y += dy;
          const pageWidth = size.w ? size.w / scale : Number.POSITIVE_INFINITY;
          const pageHeight = size.h ? size.h / scale : Number.POSITIVE_INFINITY;
          x = Math.max(0, Math.min(x, pageWidth - width));
          y = Math.max(0, Math.min(y, pageHeight - height));
        } else {
          if (drag.corner.includes("e")) width = Math.max(minSize, drag.box.width + dx);
          if (drag.corner.includes("s")) height = Math.max(minSize, drag.box.height + dy);
          if (drag.corner.includes("w")) {
            const next = Math.max(minSize, drag.box.width - dx);
            x = drag.box.x + (drag.box.width - next);
            width = next;
          }
          if (drag.corner.includes("n")) {
            const next = Math.max(minSize, drag.box.height - dy);
            y = drag.box.y + (drag.box.height - next);
            height = next;
          }
        }

        useEditorStore.getState().updateImage(drag.id, { x, y, width, height });
        return;
      }

      const fieldDrag = fieldDragRef.current;
      if (fieldDrag) {
        const dx = (event.clientX - fieldDrag.startX) / scale;
        const dy = (event.clientY - fieldDrag.startY) / scale;
        let { x, y, width, height } = fieldDrag.box;
        const minSize = 8;

        if (fieldDrag.mode === "move") {
          x += dx;
          y += dy;
          const pageWidth = size.w ? size.w / scale : Number.POSITIVE_INFINITY;
          const pageHeight = size.h ? size.h / scale : Number.POSITIVE_INFINITY;
          x = Math.max(0, Math.min(x, pageWidth - width));
          y = Math.max(0, Math.min(y, pageHeight - height));
        } else {
          if (fieldDrag.corner.includes("e")) width = Math.max(minSize, fieldDrag.box.width + dx);
          if (fieldDrag.corner.includes("s")) height = Math.max(minSize, fieldDrag.box.height + dy);
          if (fieldDrag.corner.includes("w")) {
            const next = Math.max(minSize, fieldDrag.box.width - dx);
            x = fieldDrag.box.x + (fieldDrag.box.width - next);
            width = next;
          }
          if (fieldDrag.corner.includes("n")) {
            const next = Math.max(minSize, fieldDrag.box.height - dy);
            y = fieldDrag.box.y + (fieldDrag.box.height - next);
            height = next;
          }
        }

        useEditorStore.getState().updateFormField(fieldDrag.id, { x, y, width, height });
        return;
      }

      const textDrag = textDragRef.current;
      if (textDrag) {
        const store = useEditorStore.getState();
        if (textDrag.mode === "rotate") {
          const container = containerRef.current;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          const px = event.clientX - rect.left;
          const py = event.clientY - rect.top;
          const deg = (Math.atan2(py - textDrag.centerY, px - textDrag.centerX) * 180) / Math.PI;
          // The handle sits above the box, so the pointer angle is offset by 90°.
          let rotation = Math.round(deg + 90);
          if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
          store.updateTextObject(textDrag.id, { rotation });
          return;
        }

        const dx = (event.clientX - textDrag.startX) / scale;
        const dy = (event.clientY - textDrag.startY) / scale;
        let { x, y, width, height } = textDrag.box;
        const minSize = 8;
        if (textDrag.mode === "move") {
          x += dx;
          y += dy;
          const pageWidth = size.w ? size.w / scale : Number.POSITIVE_INFINITY;
          const pageHeight = size.h ? size.h / scale : Number.POSITIVE_INFINITY;
          x = Math.max(0, Math.min(x, pageWidth - width));
          y = Math.max(0, Math.min(y, pageHeight - height));
        } else {
          if (textDrag.corner.includes("e")) width = Math.max(minSize, textDrag.box.width + dx);
          if (textDrag.corner.includes("s")) height = Math.max(minSize, textDrag.box.height + dy);
          if (textDrag.corner.includes("w")) {
            const next = Math.max(minSize, textDrag.box.width - dx);
            x = textDrag.box.x + (textDrag.box.width - next);
            width = next;
          }
          if (textDrag.corner.includes("n")) {
            const next = Math.max(minSize, textDrag.box.height - dy);
            y = textDrag.box.y + (textDrag.box.height - next);
            height = next;
          }
        }
        store.updateTextObject(textDrag.id, { x, y, width, height });
      }
<<<<<<< HEAD

      const stickyNoteDrag = stickyNoteDragRef.current;
      if (stickyNoteDrag) {
        const dx = (event.clientX - stickyNoteDrag.startX) / scale;
        const dy = (event.clientY - stickyNoteDrag.startY) / scale;
        let { x, y, width, height } = stickyNoteDrag.box;
        const pageWidth = size.w ? size.w / scale : Number.POSITIVE_INFINITY;
        const pageHeight = size.h ? size.h / scale : Number.POSITIVE_INFINITY;
        x += dx;
        y += dy;
        x = Math.max(0, Math.min(x, pageWidth - width));
        y = Math.max(0, Math.min(y, pageHeight - height));
        useEditorStore.getState().updateStickyNote?.(stickyNoteDrag.id, { x, y });
      }
=======
>>>>>>> origin/v0/anydoc-design-system
    };
    const onUp = () => {
      imageDragRef.current = null;
      fieldDragRef.current = null;
      textDragRef.current = null;
<<<<<<< HEAD
      stickyNoteDragRef.current = null;
=======
>>>>>>> origin/v0/anydoc-design-system
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [scale, size.w, size.h]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Decide up front whether this press ends an open text box: the blur-commit it
      // triggers lands before the click, so the click handler can't re-check the store.
      const session = useEditorStore.getState().textEdit;
      blockTextCreateRef.current =
        session !== null && session.pageIndex === pageNumber - 1;

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const xCss = e.clientX - rect.left;
      const yCss = e.clientY - rect.top;

      if (tool === "redact-box") {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { active: true, startX: xCss, startY: yCss, curX: xCss, curY: yCss };
        setDragRect({ x: xCss, y: yCss, w: 0, h: 0 });
        return;
      }

      if (tool === "draw") {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drawPathRef.current = `M ${xCss} ${yCss}`;
        isDrawingRef.current = true;
        return;
      }

      // Pressing on existing text opens it for editing via the span's own click handler;
      // only empty canvas should begin a draw-to-create drag.
      const target = e.target as Element;
      if ((tool === "text-add" || tool === "text-edit") && target.closest(".pdf-text-layer span")) {
        return;
      }
      // Pressing a placed object (or a form field) selects it instead of starting a new box.
      if (target.closest(".text-object-overlay") || target.closest(".form-field-overlay")) {
        return;
      }
      if (tool === "select" || tool === "hand") {
        useEditorStore.getState().setSelectedTextId(null);
      }

      // Canva-style: text and form objects are sized by dragging a box. A press that is
      // merely closing an open text box is excluded so it can't spawn a second object.
      if (isDrawToCreate(tool) && !blockTextCreateRef.current) {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        createToolRef.current = tool;
        dragRef.current = { active: true, startX: xCss, startY: yCss, curX: xCss, curY: yCss };
        setDragRect({ x: xCss, y: yCss, w: 0, h: 0 });
      }
    },
    [tool, pageNumber]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if ((tool === "redact-box" || createToolRef.current) && dragRef.current.active) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const xCss = e.clientX - rect.left;
        const yCss = e.clientY - rect.top;
        dragRef.current.curX = xCss;
        dragRef.current.curY = yCss;
        const x = Math.min(dragRef.current.startX, xCss);
        const y = Math.min(dragRef.current.startY, yCss);
        const w = Math.abs(xCss - dragRef.current.startX);
        const h = Math.abs(yCss - dragRef.current.startY);
        setDragRect({ x, y, w, h });
        return;
      }

      if (tool === "draw" && isDrawingRef.current) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const xCss = e.clientX - rect.left;
        const yCss = e.clientY - rect.top;
        drawPathRef.current += ` L ${xCss} ${yCss}`;
        const dc = drawCanvasRef.current;
        if (dc) {
          const ctx = dc.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, dc.width, dc.height);
<<<<<<< HEAD
            ctx.strokeStyle = useEditorStore.getState().drawColor;
=======
            ctx.strokeStyle = "#1a6eff";
>>>>>>> origin/v0/anydoc-design-system
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            const path = new Path2D(drawPathRef.current);
            ctx.stroke(path);
          }
        }
        return;
      }
    },
    [tool]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Finish a draw-to-create drag: the drawn box sizes the object, or a plain click
      // (no meaningful drag) falls back to that tool's default size.
      if (createToolRef.current && dragRef.current.active) {
        const createTool = createToolRef.current;
        createToolRef.current = null;
        dragRef.current.active = false;
        const { startX, startY, curX, curY } = dragRef.current;
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        setDragRect(null);
        const hasBox = w > 6 && h > 6;
        const store = useEditorStore.getState();

        const formType = FORM_TOOL_TYPES[createTool];
        if (formType) {
          const d = FORM_TOOL_DEFAULTS[formType];
          store.addFormField({
            id: createFormFieldId(),
            name: `${formType}_${store.formFields.length + 1}`,
            type: formType,
            pageIndex: pageNumber - 1,
            x: (hasBox ? x : startX) / scale,
            y: (hasBox ? y : startY) / scale,
            width: hasBox ? w / scale : d.w,
            height: hasBox ? h / scale : d.h,
            options:
              formType === "dropdown" ? ["Option 1", "Option 2", "Option 3"] : undefined,
          });
          return;
        }

        if (createTool === "text-add") {
          const heightPts = hasBox ? h / scale : 20;
          const objectId = newId();
          store.setTextEdit({
            id: objectId,
            // A placed text box stays an overlay until save, so it can be moved and rotated.
            objectId,
            pageIndex: pageNumber - 1,
            text: "",
            x: (hasBox ? x : startX) / scale,
            y: (hasBox ? y : startY) / scale,
            width: hasBox ? Math.max(w / scale, 40) : 160,
            height: heightPts,
            // A taller box gets bigger type, like dragging a text frame in Canva.
            fontSize: hasBox ? Math.max(MIN_FONT_SIZE, Math.min(heightPts * 0.7, 72)) : 12,
            fontFamily: DEFAULT_TEXT_FONT,
            color: "#111111",
            lineHeight: 1.25,
          });
          return;
        }
        return;
      }

      if (tool === "redact-box" && dragRef.current.active) {
        dragRef.current.active = false;
        const { startX, startY, curX, curY } = dragRef.current;
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        if (w > 4 && h > 4) {
          useEditorStore.getState().addRedaction({
            id: newId(),
            pageIndex: pageNumber - 1,
            x: x / scale,
            y: (size.h - (y + h)) / scale,
            width: w / scale,
            height: h / scale,
          });
          const count = useEditorStore.getState().redactions.length;
          useEditorStore.getState().setStatus(`Redaction area marked (${count}) — press Apply redactions`);
        }
        setDragRect(null);
        return;
      }

      if (tool === "draw" && isDrawingRef.current) {
        isDrawingRef.current = false;
        const pathData = drawPathRef.current;
        if (pathData) {
          // Draw stored as a single-rect annotation with the SVG path stashed in pathData.
          const container = containerRef.current;
          if (container) {
            const annot: AnnotationItem = {
              id: newId(),
              type: "draw",
              pageIndex: pageNumber - 1,
<<<<<<< HEAD
              color: drawColor,
=======
              color: "#1a6eff",
>>>>>>> origin/v0/anydoc-design-system
              rects: [{ x: 0, y: 0, width: container.clientWidth / scale, height: 0 }],
              scale,
            };
            (annot as AnnotationItem & { pathData: string }).pathData = pathData;
            useEditorStore.getState().addAnnotation(annot);
          }
        }
        const dc = drawCanvasRef.current;
        if (dc) {
          const ctx = dc.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, dc.width, dc.height);
        }
        drawPathRef.current = "";
        return;
      }

      if (tool === "sticky-note") {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const xCss = e.clientX - rect.left;
        const yCss = e.clientY - rect.top;
        const note: StickyNoteItem = {
          id: newId(),
          pageIndex: pageNumber - 1,
          x: xCss / scale,
          y: yCss / scale,
<<<<<<< HEAD
          width: 200,
          height: 150,
=======
>>>>>>> origin/v0/anydoc-design-system
          text: "New note",
          author: "User",
          date: new Date().toLocaleDateString(),
          scale,
        };
        useEditorStore.getState().addStickyNote(note);
        useEditorStore.getState().setStatus("Sticky note added");
        return;
      }
    },
    [tool, pageNumber, scale, size.h]
  );

  const onContainerClick = useCallback(
    (e: React.MouseEvent) => {
      // The press that closed an open text box must not create a fresh one.
      if (blockTextCreateRef.current) {
        blockTextCreateRef.current = false;
        return;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const xCss = e.clientX - rect.left;
      const yCss = e.clientY - rect.top;
      const x = xCss / scale;
      const y = yCss / scale;
      const store = useEditorStore.getState();

      // Form-field and text creation live in onPointerUp so a drawn drag can size the
      // object; the click handler only picks an existing image.

      if (tool === "image-edit") {
        let best: ImageObject | null = null;
        let bestDist = Infinity;
        for (const img of store.images.filter((i) => i.pageIndex === pageNumber - 1)) {
          if (x >= img.x && x <= img.x + img.width && y >= img.y && y <= img.y + img.height) {
            store.setSelectedImageId(img.id);
            return;
          }
          const cx = img.x + img.width / 2;
          const cy = img.y + img.height / 2;
          const dist = (cx - x) ** 2 + (cy - y) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            best = img;
          }
        }
        if (best && bestDist < 20000) store.setSelectedImageId(best.id);
        else store.setSelectedImageId(null);
      }
    },
    [tool, pageNumber, scale]
  );

  const isEditing = textEdit !== null && textEdit.pageIndex === pageNumber - 1;
  const cursorStyle =
    tool === "hand"
      ? "grab"
      : tool === "highlight" || tool === "underline" || tool === "strikethrough"
      ? "text"
      : tool === "draw" || tool === "redact-box"
      ? "crosshair"
      : tool === "text-add"
      ? "text"
      : tool === "text-edit"
      ? "text"
      : "default";

  return (
    <div
      ref={containerRef}
      className="page-frame"
      style={{
        width: size.w || undefined,
        height: size.h || undefined,
        cursor: cursorStyle,
        position: "relative",
      }}
      onClick={onContainerClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />

      {renderError && (
        <div
          role="alert"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: 24,
            textAlign: "center",
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--c-text-muted)",
            backgroundColor: "var(--c-surface-raised)",
          }}
        >
          {renderError}
        </div>
      )}

      {/* Text layer: invisible spans for text-edit / text-add hit testing. Clicks that
          land on a span edit that text; clicks on the gaps bubble to the container. */}
      <div ref={textLayerRef} className="pdf-text-layer" />

      {/* OCR text layer — selectable words produced by the Tesseract worker */}
      {ocrPage && ocrPage.words.length > 0 && (
        <div
          className="pdf-ocr-layer"
          style={{
            pointerEvents: isMarkupTool(tool) || tool === "select" ? "auto" : "none",
          }}
        >
          {ocrPage.words.map((word, index) => (
            <span
              key={`${pageNumber}-ocr-${index}`}
              style={{
                left: `${word.x * 100}%`,
                top: `${word.y * 100}%`,
                width: `${word.width * 100}%`,
                height: `${word.height * 100}%`,
                fontSize: `${Math.max(6, word.height * size.h)}px`,
              }}
            >
              {word.text}
            </span>
          ))}
        </div>
      )}

      {tool === "draw" && (
        <canvas
          ref={drawCanvasRef}
          width={size.w}
          height={size.h}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      )}

      {/* Only veil the very first paint. Re-renders after an edit repaint the existing
          canvas in place; a white veil there read as the page "turning white". */}
      {rendering && size.w === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(255,255,255,0.5)",
            color: "#333",
            fontSize: 13,
          }}
        >
          Rendering…
        </div>
      )}

      {pageAnnotations.map((annot) => {
        if (annot.type === "highlight") {
          return annot.rects.map((r, i) => (
            <div
              key={`${annot.id}-${i}`}
              style={{
                position: "absolute",
                left: r.x * scale,
                top: r.y * scale,
                width: r.width * scale,
                height: r.height * scale,
                backgroundColor: renderColor("highlight", annot.color, annot.opacity ?? markupOpacity),
                pointerEvents: "none",
                zIndex: 5,
                borderRadius: 2,
                mixBlendMode: "multiply",
              }}
            />
          ));
        }

        if (annot.type === "underline") {
          return annot.rects.map((r, i) => (
            <div
              key={`${annot.id}-${i}`}
              style={{
                position: "absolute",
                left: r.x * scale,
                top: r.lineY !== undefined ? r.lineY * scale : (r.y + r.height) * scale,
                width: r.width * scale,
                height: 2.5,
                backgroundColor: renderColor("underline", annot.color),
                pointerEvents: "none",
                zIndex: 5,
              }}
            />
          ));
        }

        if (annot.type === "strikethrough") {
          return annot.rects.map((r, i) => {
            // 50% of a line box lands in the descender; strike ~32% up to sit on the x-height.
            const baseline = r.lineY ?? r.y + r.height;
            return (
              <div
                key={`${annot.id}-${i}`}
                style={{
                  position: "absolute",
                  left: r.x * scale,
                  top: (baseline - r.height * 0.32) * scale,
                  width: r.width * scale,
                  height: Math.max(1.5, 1.4 * scale),
                  backgroundColor: renderColor("strikethrough", annot.color),
                  pointerEvents: "none",
                  zIndex: 5,
                }}
              />
            );
          });
        }

        if (annot.type === "draw") {
          const pathData = (annot as AnnotationItem & { pathData?: string }).pathData;
          if (!pathData) return null;
          return (
            <svg
              key={annot.id}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 5,
                overflow: "visible",
              }}
            >
              <path
                d={pathData}
                stroke={annot.color}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );
        }

<<<<<<< HEAD
return null;
        })}

      {/* Sticky Notes — rendered as editable overlays with drag support. */}
      {pageStickyNotes.map((note) => {
        const selected = selectedStickyNoteId === note.id;
        const editing = editingStickyNoteId === note.id;
        const movable = tool === "select" || tool === "hand" || tool === "sticky-note";
        const startDrag = (e: React.PointerEvent) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          setSelectedStickyNoteId(note.id);
          stickyNoteDragRef.current = {
            id: note.id,
            startX: e.clientX,
            startY: e.clientY,
            box: { x: note.x, y: note.y, width: note.width, height: note.height },
          };
        };
        const handleDoubleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          setEditingStickyNoteId(note.id);
          setStickyNoteText(note.text);
        };
        const handleBlur = () => {
          if (editingStickyNoteId === note.id) {
            useEditorStore.getState().updateStickyNote(note.id, { text: stickyNoteText });
            setEditingStickyNoteId(null);
          }
        };
        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleBlur();
          }
          if (e.key === "Escape") {
            setStickyNoteText(note.text);
            handleBlur();
          }
        };
        return (
          <div
            key={note.id}
            className="sticky-note-overlay"
            title={editing ? "" : "Drag to move · double-click to edit"}
            onPointerDown={movable ? startDrag : undefined}
            onDoubleClick={handleDoubleClick}
            style={{
              position: "absolute",
              left: note.x * scale,
              top: note.y * scale,
              width: Math.max(note.width * scale, 120),
              minHeight: Math.max(note.height * scale, 80),
              zIndex: 9,
              cursor: movable ? "move" : "text",
              outline: selected ? "1.5px solid #0a84ff" : "1px dashed rgba(10,132,255,0.35)",
              outlineOffset: -1,
              pointerEvents: editing ? "none" : "auto",
              touchAction: "none",
              backgroundColor: "#fff9c4",
              border: "1px solid #f0e080",
              borderRadius: 2,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 6px",
                background: "rgba(0,0,0,0.05)",
                borderBottom: "1px solid #f0e080",
                borderRadius: "2px 2px 0 0",
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: 10, color: "#666", whiteSpace: "nowrap" }}>
                {note.author} · {note.date}
              </span>
              {selected && movable && (
                <button
                  type="button"
                  aria-label="Delete sticky note"
                  onClick={(e) => {
                    e.stopPropagation();
                    useEditorStore.getState().removeStickyNote(note.id);
                    setSelectedStickyNoteId(null);
                  }}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 2,
                    background: "transparent",
                    border: "none",
                    color: "#999",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                autoFocus
                value={stickyNoteText}
                onChange={(e) => setStickyNoteText(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                style={{
                  flex: 1,
                  padding: 8,
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  color: "#111",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  resize: "both",
                  minHeight: 60,
                  lineHeight: 1.4,
                }}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  padding: 8,
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  color: "#111",
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflow: "hidden",
                }}
              >
                {note.text || "New note"}
              </div>
            )}
          </div>
        );
=======
        return null;
>>>>>>> origin/v0/anydoc-design-system
      })}

      {/* Marked redaction areas — burned into the pixels when applied. */}
      {pageRedactions.map((r, index) => (
        <div
          key={r.id}
          style={{
            position: "absolute",
            left: r.x * scale,
            top: size.h - (r.y + r.height) * scale,
            width: r.width * scale,
            height: r.height * scale,
            backgroundColor: "rgba(0, 0, 0, 0.88)",
            border: "1px solid var(--danger)",
            zIndex: 12,
            pointerEvents: "none",
            display: "grid",
            placeItems: "center",
            borderRadius: 2,
          }}
        >
          <span
            style={{
              color: "#ffffff",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
            }}
          >
            {index + 1}
          </span>
        </div>
      ))}

      {dragRect && (dragRect.w > 2 || dragRect.h > 2) && (
        <div
          style={{
            position: "absolute",
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.w,
            height: dragRect.h,
            background:
              tool === "redact-box"
                ? "rgba(255, 69, 58, 0.25)"
                : isDrawToCreate(tool)
                ? "rgba(10, 132, 255, 0.14)"
                : tool === "highlight"
                ? "rgba(255, 214, 0, 0.28)"
                : tool === "underline"
                ? "rgba(30, 100, 255, 0.15)"
                : "rgba(220, 50, 50, 0.15)",
            border:
              tool === "redact-box"
                ? "1px dashed var(--danger)"
                : isDrawToCreate(tool)
                ? "1px dashed var(--c-primary)"
                : "1px dashed rgba(0,0,0,0.3)",
            pointerEvents: "none",
            zIndex: 15,
            borderRadius: 2,
          }}
        />
      )}

      {pageTextObjects.map((t) => {
        const selected = selectedTextId === t.id;
        // Both the select tool and the hand tool move/rotate placed objects; empty page
        // areas still pan with the hand tool.
        const movable = tool === "select" || tool === "hand";
        const editingThis = textEdit?.objectId === t.id;
        const corners = ["nw", "ne", "se", "sw"] as const;
        const startDrag = (
          e: React.PointerEvent,
          mode: "move" | "resize" | "rotate",
          corner: (typeof corners)[number]
        ) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          useEditorStore.getState().setSelectedTextId(t.id);
          textDragRef.current = {
            id: t.id,
            mode,
            corner,
            startX: e.clientX,
            startY: e.clientY,
            box: { x: t.x, y: t.y, width: t.width, height: t.height },
            centerX: (t.x + t.width / 2) * scale,
            centerY: (t.y + t.height / 2) * scale,
          };
        };
        return (
          <div
            key={t.id}
            className="text-object-overlay"
            title="Drag to move · double-click to edit"
            onPointerDown={(e) => {
              if (!movable) return;
              startDrag(e, "move", "se");
            }}
            onClick={(e) => {
              if (tool === "text-edit" || tool === "text-add") {
                e.stopPropagation();
                openTextObject(t);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              openTextObject(t);
            }}
            style={{
              position: "absolute",
              left: t.x * scale,
              top: t.y * scale,
              width: Math.max(t.width * scale, 10),
              height: Math.max(t.height * scale, 10),
              zIndex: 9,
              transform: t.rotation ? `rotate(${t.rotation}deg)` : undefined,
              transformOrigin: "center",
              cursor: movable ? "move" : "text",
              outline: selected ? "1.5px solid #0a84ff" : "1px dashed rgba(10,132,255,0.35)",
              outlineOffset: -1,
              pointerEvents: editingThis ? "none" : "auto",
              touchAction: "none",
              backgroundColor: selected ? "rgba(10,132,255,0.05)" : undefined,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                whiteSpace: "pre-wrap",
                overflow: "hidden",
                fontSize: t.fontSize * scale,
                fontFamily: t.fontFamily,
                fontWeight: t.bold ? 700 : 400,
                textDecoration: [
                  t.underline ? "underline" : "",
                  t.strikethrough ? "line-through" : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined,
                color: t.color,
                lineHeight: t.lineHeight ?? 1.25,
                // No padding: the overlay baseline must match the baked baseline.
                padding: 0,
                userSelect: "none",
                // Match the bake: RTL runs sit against the right edge of the box.
                direction: isRtl(t.text) ? "rtl" : "ltr",
                textAlign: isRtl(t.text) ? "right" : "left",
              }}
            >
              {t.text}
            </div>
            {selected && movable && (
              <>
                {corners.map((corner) => (
                  <span
                    key={corner}
                    aria-label={`Resize text ${corner}`}
                    onPointerDown={(e) => startDrag(e, "resize", corner)}
                    style={{
                      position: "absolute",
                      width: 10,
                      height: 10,
                      background: "#ffffff",
                      border: "2px solid #0a84ff",
                      borderRadius: 2,
                      ...(corner.includes("n") ? { top: -5 } : { bottom: -5 }),
                      ...(corner.includes("w") ? { left: -5 } : { right: -5 }),
                      cursor: `${corner}-resize`,
                    }}
                  />
                ))}
                <span
                  aria-label="Rotate text"
                  title="Drag to rotate (hold Shift to snap)"
                  onPointerDown={(e) => startDrag(e, "rotate", "se")}
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -22,
                    marginLeft: -6,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: "#0a84ff",
                    border: "2px solid #ffffff",
                    cursor: "grab",
                  }}
                />
              </>
            )}
          </div>
        );
      })}

      {pageFields.map((f) => {
        const selected = selectedFormId === f.id;
        // The default select tool and the hand tool move/resize placed objects.
        const movable = tool === "select" || tool === "hand";
        return (
          <div
            key={f.id}
            className={`form-field-overlay${selected ? " selected" : ""}`}
            style={{
              left: f.x * scale,
              top: f.y * scale,
              width: f.width * scale,
              height: f.height * scale,
              cursor: movable ? "move" : "default",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              if (!movable) return;
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              useEditorStore.getState().setSelectedFormId(f.id);
              fieldDragRef.current = {
                id: f.id,
                mode: "move",
                corner: "se",
                startX: e.clientX,
                startY: e.clientY,
                box: { x: f.x, y: f.y, width: f.width, height: f.height },
              };
            }}
            onClick={(e) => {
              e.stopPropagation();
              useEditorStore.getState().setSelectedFormId(f.id);
            }}
            title={f.name}
          >
            <span style={{ fontSize: 10, padding: 2, color: "#1a4a8a" }}>{f.type}</span>
            {selected &&
              movable &&
              (["nw", "ne", "se", "sw"] as const).map((corner) => (
                <span
                  key={corner}
                  aria-label={`Resize field ${corner}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                    useEditorStore.getState().setSelectedFormId(f.id);
                    fieldDragRef.current = {
                      id: f.id,
                      mode: "resize",
                      corner,
                      startX: e.clientX,
                      startY: e.clientY,
                      box: { x: f.x, y: f.y, width: f.width, height: f.height },
                    };
                  }}
                  style={{
                    position: "absolute",
                    width: 10,
                    height: 10,
                    background: "#ffffff",
                    border: "2px solid #0a84ff",
                    borderRadius: 2,
                    ...(corner.includes("n") ? { top: -5 } : { bottom: -5 }),
                    ...(corner.includes("w") ? { left: -5 } : { right: -5 }),
                    cursor: `${corner}-resize`,
                  }}
                />
              ))}
          </div>
        );
      })}

      {pageImages
        .filter((img) => !img.removed)
        .map((img) => {
          const selected = selectedImageId === img.id;
          const editable = tool === "image-edit" || tool === "select";
          return (
            <div
              key={img.id}
              className={`object-selection${selected ? " selected" : ""}`}
              onPointerDown={(e) => {
                if (!editable) return;
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                useEditorStore.getState().setSelectedImageId(img.id);
                imageDragRef.current = {
                  id: img.id,
                  mode: "move",
                  corner: "se",
                  startX: e.clientX,
                  startY: e.clientY,
                  box: { x: img.x, y: img.y, width: img.width, height: img.height },
                };
              }}
              style={{
                position: "absolute",
                left: img.x * scale,
                top: img.y * scale,
                width: img.width * scale,
                height: img.height * scale,
                display: editable || selected ? "block" : "none",
                pointerEvents: editable ? "auto" : "none",
                outline: selected
                  ? "2px solid #0a84ff"
                  : "1px dashed rgba(10, 132, 255, 0.5)",
                outlineOffset: -1,
                cursor: editable ? "move" : "default",
                touchAction: "none",
                zIndex: 8,
                transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined,
              }}
            >
              {img.replaced && img.dataUrl && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url(${img.dataUrl})`,
                    backgroundSize: "100% 100%",
                    backgroundRepeat: "no-repeat",
                    pointerEvents: "none",
                  }}
                />
              )}
              {selected && editable &&
                (["nw", "ne", "se", "sw"] as const).map((corner) => (
                  <span
                    key={corner}
                    aria-label={`Resize image ${corner}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                      useEditorStore.getState().setSelectedImageId(img.id);
                      imageDragRef.current = {
                        id: img.id,
                        mode: "resize",
                        corner,
                        startX: e.clientX,
                        startY: e.clientY,
                        box: { x: img.x, y: img.y, width: img.width, height: img.height },
                      };
                    }}
                    style={{
                      position: "absolute",
                      width: 10,
                      height: 10,
                      background: "#ffffff",
                      border: "2px solid #0a84ff",
                      borderRadius: 2,
                      ...(corner.includes("n") ? { top: -5 } : { bottom: -5 }),
                      ...(corner.includes("w") ? { left: -5 } : { right: -5 }),
                      cursor: `${corner}-resize`,
                    }}
                  />
                ))}
            </div>
          );
        })}

      {isEditing && (
        <>
          {textEdit.eraseUnderlay && (
            // The original glyphs are still baked into the page; hide them with a live white
            // plate so the user doesn't see double text while editing. The same rectangle is
            // permanently burned in when the edit is committed.
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: textEdit.x * scale - 2,
                top: textEdit.y * scale - 2,
                width: Math.max(textEdit.width * scale, 100) + 4,
                height: Math.max(textEdit.height * scale, textEdit.fontSize * scale * 1.4) + 4,
                zIndex: 19,
                background: "#ffffff",
                pointerEvents: "none",
              }}
            />
          )}
          <div
            ref={styleBarRef}
            className="text-style-bar"
            style={{ left: textEdit.x * scale, top: Math.max(2, textEdit.y * scale - 40) }}
          >
            <select
              aria-label="Font"
              value={textEdit.fontFamily}
              onChange={(e) => patchSession({ fontFamily: e.target.value })}
              style={{
                height: 22,
                fontSize: 11,
                background: "transparent",
                color: "inherit",
                border: "none",
                outline: "none",
                cursor: "pointer",
                maxWidth: 96,
              }}
            >
              {!TEXT_FONT_CHOICES.some((f) => f.value === textEdit.fontFamily) && (
                // Keep the source face visible instead of letting the select fall back
                // to its first option and silently reset the font.
                <option value={textEdit.fontFamily}>
                  {textEdit.fontFamily.split(",")[0].replace(/"/g, "")}
                </option>
              )}
              {TEXT_FONT_CHOICES.map((f) => (
<<<<<<< HEAD
                <option key={f.label} value={f.value} style={{ color: "#111" }}>
=======
                <option key={f.label} value={f.value}>
>>>>>>> origin/v0/anydoc-design-system
                  {f.label}
                </option>
              ))}
            </select>
            <span className="text-style-sep" />
            <input
              type="color"
              aria-label="Text colour"
              title="Text colour"
              value={textEdit.color}
              onChange={(e) => patchSession({ color: e.target.value })}
              style={{
                width: 22,
                height: 20,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            />
            <span className="text-style-sep" />
            <button
              type="button"
              aria-label="Decrease font size"
              onClick={() =>
                patchSession({ fontSize: Math.max(MIN_FONT_SIZE, textEdit.fontSize - 1) })
              }
            >
              <Minus size={12} />
            </button>
            <span className="text-style-value">{Math.round(textEdit.fontSize)}</span>
            <button
              type="button"
              aria-label="Increase font size"
              onClick={() =>
                patchSession({ fontSize: Math.min(MAX_FONT_SIZE, textEdit.fontSize + 1) })
              }
            >
              <Plus size={12} />
            </button>
            <span className="text-style-sep" />
            <span className="text-style-sep" />
            <button
              type="button"
              aria-label="Toggle bold"
              aria-pressed={!!textEdit.bold}
              onClick={() => patchSession({ bold: !textEdit.bold })}
              style={{ fontWeight: 800 }}
            >
              B
            </button>
            <span className="text-style-label">Spacing</span>
<<<<<<< HEAD
            <div style={{ display: "flex", alignItems: "center", gap: 6, width: 160 }}>
              <input
                type="range"
                min={MIN_LINE_HEIGHT}
                max={MAX_LINE_HEIGHT}
                step={0.05}
                value={textEdit.lineHeight ?? 1.25}
                onChange={(e) =>
                  patchSession({ lineHeight: Number(Number(e.target.value).toFixed(2)) })
                }
                aria-label="Line spacing"
                style={{
                  flex: 1,
                  height: 16,
                  accentColor: "var(--c-primary)",
                  cursor: "pointer",
                }}
              />
              <span
                className="text-style-value"
                style={{
                  minWidth: 36,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {(textEdit.lineHeight ?? 1.25).toFixed(2)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 0,
                padding: "0 4px",
                fontSize: 9,
                color: "var(--c-text-muted)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            >
              <span style={{ width: 48, textAlign: "left" }}>1.0</span>
              <span style={{ width: 48, textAlign: "center" }}>1.5</span>
              <span style={{ width: 48, textAlign: "right" }}>3.0</span>
            </div>
=======
            <button
              type="button"
              aria-label="Decrease line spacing"
              onClick={() =>
                patchSession({
                  lineHeight: Math.max(
                    MIN_LINE_HEIGHT,
                    Number(((textEdit.lineHeight ?? 1.25) - 0.1).toFixed(2))
                  ),
                })
              }
            >
              <Minus size={12} />
            </button>
            <span className="text-style-value">{(textEdit.lineHeight ?? 1.25).toFixed(1)}</span>
            <button
              type="button"
              aria-label="Increase line spacing"
              onClick={() =>
                patchSession({
                  lineHeight: Math.min(
                    MAX_LINE_HEIGHT,
                    Number(((textEdit.lineHeight ?? 1.25) + 0.1).toFixed(2))
                  ),
                })
              }
            >
              <Plus size={12} />
            </button>
>>>>>>> origin/v0/anydoc-design-system
          </div>
          {fontNotice && textEdit && (
            <div
              role="status"
              data-testid="font-substitution-notice"
              style={{
                position: "absolute",
                zIndex: 22,
                left: textEdit.x * scale,
                top: Math.max(2, textEdit.y * scale - 40) + 34,
                maxWidth: 300,
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid var(--c-border-subtle)",
                background: "var(--c-surface-raised)",
                boxShadow: "0 6px 18px rgba(0, 0, 0, 0.2)",
                color: "var(--c-text-muted)",
                fontSize: 10.5,
                lineHeight: 1.4,
                whiteSpace: "normal",
              }}
            >
              {fontNotice}
            </div>
          )}
          <textarea
            autoFocus
            value={localText}
            placeholder={
              /* text-add gets a placeholder; text-edit keeps the span text */
              useEditorStore.getState().tool === "text-add" ? "Type here…" : undefined
            }
            onChange={(e) => setLocalText(e.target.value)}
            onPointerUp={(e) => {
              // The native resize handle changes only the DOM box; feed the new size back
              // into the session so the bake wraps at the same width the user sees.
              const el = e.currentTarget;
              const width = el.offsetWidth / scale;
              const height = el.offsetHeight / scale;
              if (
                Math.abs(width - textEdit.width) > 0.5 ||
                Math.abs(height - textEdit.height) > 0.5
              ) {
                patchSession({ width, height });
              }
            }}
            onBlur={(e) => {
              // Clicking the style controls keeps the session open so tweaks stay live.
              if (styleBarRef.current?.contains(e.relatedTarget as Node | null)) return;
              commitTextEdit();
            }}
            onKeyDown={(e) => {
              // Formatting shortcuts while typing (add and edit share this textarea).
              if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase();
                if (key === "b") {
                  e.preventDefault();
                  patchSession({ bold: !textEdit.bold });
                  return;
                }
                if (key === "u") {
                  e.preventDefault();
                  patchSession({ underline: !textEdit.underline });
                  return;
                }
                if (e.key === "5") {
                  e.preventDefault();
                  patchSession({ strikethrough: !textEdit.strikethrough });
                  return;
                }
                if (e.key === "]" || e.key === "}") {
                  e.preventDefault();
                  patchSession({ fontSize: Math.min(MAX_FONT_SIZE, textEdit.fontSize + 1) });
                  return;
                }
                if (e.key === "[" || e.key === "{") {
                  e.preventDefault();
                  patchSession({ fontSize: Math.max(MIN_FONT_SIZE, textEdit.fontSize - 1) });
                  return;
                }
              }
              if (e.key === "Escape") {
                for (const node of editingSpansRef.current) node.style.opacity = "";
                editingSpansRef.current = [];
                useEditorStore.getState().setTextEdit(null);
                return;
              }
              // Enter saves the text; Shift+Enter inserts a line break.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitTextEdit();
              }
            }}
            style={{
              position: "absolute",
              left: textEdit.x * scale,
              top: textEdit.y * scale,
              // Match the session box (small floor only for touch targets); the previous
              // 100px floor let the textarea wrap wider than the committed block.
              width: Math.max(textEdit.width * scale, 24),
              minHeight: Math.max(textEdit.height * scale, 20),
              fontSize: textEdit.fontSize * scale,
              fontFamily: textEdit.fontFamily,
              fontWeight: textEdit.bold ? 700 : 400,
              textDecoration: [
                textEdit.underline ? "underline" : "",
                textEdit.strikethrough ? "line-through" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined,
              color: textEdit.color,
              direction: isRtl(localText) ? "rtl" : "ltr",
              textAlign: isRtl(localText) ? "right" : "left",
              transform: textEdit.rotation ? `rotate(${textEdit.rotation}deg)` : undefined,
              transformOrigin: "center",
              zIndex: 20,
              // Outline instead of a border: a border would inset the content by 2px and
              // shift the first line relative to where the edit is baked.
              outline: "2px solid var(--accent, #0a84ff)",
              border: "none",
              boxSizing: "border-box",
              // No white plate: the page shows through exactly as it will bake.
              background: "transparent",
              resize: "both",
              lineHeight: textEdit.lineHeight ?? 1.25,
              padding: 0,
              borderRadius: 3,
              boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
            }}
          />
        </>
      )}

      {selectionMenu && (
        <div
          className="selection-menu"
          style={{
            position: "fixed",
            left: selectionMenu.left,
            top: Math.max(8, selectionMenu.top - 46),
            transform: "translateX(-50%)",
            zIndex: 90,
          }}
          onPointerDown={(e) => e.preventDefault()}
        >
          <span className="selection-menu-hint">Style</span>
          <button
            type="button"
            title="Highlight selection"
            aria-label="Highlight selection"
            onClick={() => addMarkup("highlight", rectsFromRange(selectionMenu.range))}
          >
            <Highlighter size={14} />
          </button>
          <button
            type="button"
            title="Underline selection"
            aria-label="Underline selection"
            onClick={() => addMarkup("underline", rectsFromRange(selectionMenu.range))}
          >
            <Underline size={14} />
          </button>
          <button
            type="button"
            title="Strike through selection"
            aria-label="Strike through selection"
            onClick={() =>
              addMarkup("strikethrough", rectsFromRange(selectionMenu.range))
            }
          >
            <Strikethrough size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

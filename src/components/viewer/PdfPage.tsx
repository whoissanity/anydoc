"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditorStore } from "@/store/editor-store";
import { mapPdfFontToCss } from "@/lib/text/fonts";
import { applyTextEdit } from "@/lib/edit/edit-engine";
import { reloadFromBytes } from "@/lib/document/document-service";
import { withRenderLock } from "@/lib/document/render-queue";
import { createFormFieldId } from "@/lib/edit/forms";
import { Highlighter, Strikethrough, Underline } from "lucide-react";
import type { AnnotationItem, FormFieldDraft, ImageObject, StickyNoteItem } from "@/lib/types";

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

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

interface Props {
  pageNumber: number;
  scale: number;
  widthHint?: number;
}

export function PdfPage({ pageNumber, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rendering, setRendering] = useState(true);

  // Local textarea state avoids a store re-render on each keystroke.
  const [localText, setLocalText] = useState("");
  const editingSpanRef = useRef<HTMLElement | null>(null);

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

  const pdfDocProxy = useEditorStore((s) => s.pdfDocProxy);
  const tool = useEditorStore((s) => s.tool);
  const formFields = useEditorStore((s) => s.formFields);
  const selectedFormId = useEditorStore((s) => s.selectedFormId);
  const images = useEditorStore((s) => s.images);
  const selectedImageId = useEditorStore((s) => s.selectedImageId);
  const layers = useEditorStore((s) => s.layers);
  const textEdit = useEditorStore((s) => s.textEdit);
  const annotations = useEditorStore((s) => s.annotations);
  const annotColor = useEditorStore((s) => s.annotColor);
  const underlineColor = useEditorStore((s) => s.underlineColor);
  const strikeColor = useEditorStore((s) => s.strikeColor);
  const markupOpacity = useEditorStore((s) => s.markupOpacity);
  const redactions = useEditorStore((s) => s.redactions);
  const ocrPage = useEditorStore((s) =>
    s.ocrPages.find((p) => p.pageIndex === pageNumber - 1)
  );

  const pageFields = formFields.filter((f) => f.pageIndex === pageNumber - 1);
  const pageImages = images.filter((i) => i.pageIndex === pageNumber - 1);
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageNumber - 1);
  const pageRedactions = redactions.filter((r) => r.pageIndex === pageNumber - 1);

  // Sync local text when the session changes (a new span was clicked).
  useEffect(() => {
    if (textEdit && textEdit.pageIndex === pageNumber - 1) {
      setLocalText(textEdit.text);
    }
  }, [textEdit, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!pdfDocProxy || !canvasRef.current) return;
      setRendering(true);
      const doc = pdfDocProxy as {
        getPage: (n: number) => Promise<{
          getViewport: (opts: { scale: number }) => { width: number; height: number };
          render: (opts: unknown) => { promise: Promise<void> };
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
      const viewport = page.getViewport({ scale });
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setSize({ w: viewport.width, h: viewport.height });

      await withRenderLock(() => page.render({ canvasContext: ctx, viewport }).promise);
      if (cancelled) return;
      useEditorStore.getState().markPageRendered();

      const textContent = await page.getTextContent();
      // A superseded pass must not touch the layer or it repaints stale spans at the old zoom.
      if (cancelled) return;
      const layer = textLayerRef.current;
      if (layer) {
        layer.style.width = `${viewport.width}px`;
        layer.style.height = `${viewport.height}px`;
        const fragment = document.createDocumentFragment();
        const placed: Array<{ span: HTMLSpanElement; width: number }> = [];
        for (const item of textContent.items) {
          if (!("str" in item) || !item.str) continue;
          const tx = item.transform;
          const span = document.createElement("span");
          const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
          const left = tx[4] * scale;
          const top = viewport.height - tx[5] * scale - fontHeight * scale;
          span.textContent = item.str;
          span.style.left = `${left}px`;
          span.style.top = `${top}px`;
          span.style.fontSize = `${fontHeight * scale}px`;
          span.style.fontFamily = mapPdfFontToCss(item.fontName);
          span.dataset.x = String(tx[4]);
          span.dataset.y = String(viewport.height / scale - tx[5]);
          span.dataset.fontSize = String(fontHeight);
          span.dataset.fontFamily = mapPdfFontToCss(item.fontName);
          span.dataset.width = String(item.width || fontHeight * item.str.length * 0.5);
          span.dataset.height = String(fontHeight);

          span.addEventListener("click", (e) => {
            const currentTool = useEditorStore.getState().tool;
            if (currentTool !== "text-edit") return;
            e.stopPropagation();
            // Hide the span so it doesn't show through the textarea
            span.style.opacity = "0";
            editingSpanRef.current = span;
            useEditorStore.getState().setTextEdit({
              pageIndex: pageNumber - 1,
              text: item.str,
              x: tx[4],
              y: viewport.height / scale - tx[5] - fontHeight,
              width: Math.max(item.width || 40, 60),
              height: fontHeight * 1.2,
              fontSize: Math.max(8, fontHeight),
              fontFamily: mapPdfFontToCss(item.fontName),
              color: "#111111",
            });
          });
          placed.push({ span, width: (item.width || 0) * scale });
          fragment.appendChild(span);
        }
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
    render().catch(() => setRendering(false));
    return () => {
      cancelled = true;
      // Stop the spinner on an abandoned pass; the replacement pass re-arms its own.
      setRendering(false);
    };
  }, [pdfDocProxy, pageNumber, scale, layers]);

  const commitTextEdit = useCallback(async () => {
    const session = useEditorStore.getState().textEdit;
    const bytes = useEditorStore.getState().pdfBytes;
    if (!session || !bytes) {
      // text-add with no session: nothing to commit
      useEditorStore.getState().setTextEdit(null);
      return;
    }
    if (editingSpanRef.current) {
      editingSpanRef.current.style.opacity = "";
      editingSpanRef.current = null;
    }
    // Use the locally-tracked text value (not from store, to avoid lag)
    const committed = { ...session, text: localText };
    useEditorStore.getState().setStatus("Applying text edit…");
    useEditorStore.getState().setTextEdit(null);
    const next = await applyTextEdit(bytes, committed);
    await reloadFromBytes(next);
    useEditorStore.getState().setStatus("Text updated");
  }, [localText]);

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
      useEditorStore.getState().addAnnotation({
        id: nanoid(),
        type,
        pageIndex: pageNumber - 1,
        color,
        opacity: type === "highlight" ? markupOpacity : 1,
        scale,
        rects,
      });
      useEditorStore
        .getState()
        .setStatus(`${type.charAt(0).toUpperCase() + type.slice(1)} applied to selection`);
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

  // Image move/resize updates the store live; edits bake into the PDF on save.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = imageDragRef.current;
      if (!drag) return;
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
    };
    const onUp = () => {
      imageDragRef.current = null;
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
    },
    [tool]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (tool === "redact-box" && dragRef.current.active) {
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
            ctx.strokeStyle = "#1a6eff";
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
      if (tool === "redact-box" && dragRef.current.active) {
        dragRef.current.active = false;
        const { startX, startY, curX, curY } = dragRef.current;
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        if (w > 4 && h > 4) {
          useEditorStore.getState().addRedaction({
            id: nanoid(),
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
              id: nanoid(),
              type: "draw",
              pageIndex: pageNumber - 1,
              color: "#1a6eff",
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
          id: nanoid(),
          pageIndex: pageNumber - 1,
          x: xCss / scale,
          y: yCss / scale,
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
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const xCss = e.clientX - rect.left;
      const yCss = e.clientY - rect.top;
      const x = xCss / scale;
      const y = yCss / scale;
      const store = useEditorStore.getState();

      if (tool.startsWith("form-")) {
        const typeMap: Record<string, FormFieldDraft["type"]> = {
          "form-text": "text",
          "form-checkbox": "checkbox",
          "form-radio": "radio",
          "form-dropdown": "dropdown",
          "form-signature": "signature",
          "form-submit": "submit",
        };
        const type = typeMap[tool];
        if (!type) return;
        const defaults: Record<string, { w: number; h: number }> = {
          text: { w: 160, h: 22 },
          checkbox: { w: 16, h: 16 },
          radio: { w: 16, h: 16 },
          dropdown: { w: 140, h: 22 },
          signature: { w: 180, h: 40 },
          submit: { w: 100, h: 28 },
        };
        const d = defaults[type];
        store.addFormField({
          id: createFormFieldId(),
          name: `${type}_${store.formFields.length + 1}`,
          type,
          pageIndex: pageNumber - 1,
          x,
          y,
          width: d.w,
          height: d.h,
          options: type === "dropdown" ? ["Option 1", "Option 2", "Option 3"] : undefined,
        });
        return;
      }

      if (tool === "text-add") {
        store.setTextEdit({
          pageIndex: pageNumber - 1,
          text: "",
          x,
          y,
          width: 160,
          height: 20,
          fontSize: 12,
          fontFamily: "Helvetica, Arial, sans-serif",
          color: "#111111",
        });
        return;
      }

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
      data-page={pageNumber}
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

      {/* Text layer: invisible spans for text-edit click detection */}
      <div
        ref={textLayerRef}
        className="pdf-text-layer"
        style={{
          // For text-add let clicks pass through the text layer to the container.
          pointerEvents: tool === "text-add" ? "none" : undefined,
        }}
      />

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

      {rendering && (
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

        return null;
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
                : tool === "highlight"
                ? "rgba(255, 214, 0, 0.28)"
                : tool === "underline"
                ? "rgba(30, 100, 255, 0.15)"
                : "rgba(220, 50, 50, 0.15)",
            border:
              tool === "redact-box"
                ? "1px dashed var(--danger)"
                : "1px dashed rgba(0,0,0,0.3)",
            pointerEvents: "none",
            zIndex: 15,
            borderRadius: 2,
          }}
        />
      )}

      {pageFields.map((f) => (
        <div
          key={f.id}
          className={`form-field-overlay${selectedFormId === f.id ? " selected" : ""}`}
          style={{
            left: f.x * scale,
            top: f.y * scale,
            width: f.width * scale,
            height: f.height * scale,
          }}
          onClick={(e) => {
            e.stopPropagation();
            useEditorStore.getState().setSelectedFormId(f.id);
          }}
          title={f.name}
        >
          <span style={{ fontSize: 10, padding: 2, color: "#1a4a8a" }}>{f.type}</span>
        </div>
      ))}

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
        <textarea
          autoFocus
          value={localText}
          placeholder={
            /* text-add gets a placeholder; text-edit keeps the span text */
            useEditorStore.getState().tool === "text-add" ? "Type here…" : undefined
          }
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={() => commitTextEdit()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (editingSpanRef.current) {
                editingSpanRef.current.style.opacity = "";
                editingSpanRef.current = null;
              }
              useEditorStore.getState().setTextEdit(null);
            }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              commitTextEdit();
            }
          }}
          style={{
            position: "absolute",
            left: textEdit.x * scale,
            top: textEdit.y * scale,
            width: Math.max(textEdit.width * scale, 100),
            minHeight: Math.max(textEdit.height * scale, 24),
            fontSize: textEdit.fontSize * scale,
            fontFamily: textEdit.fontFamily,
            color: textEdit.color,
            zIndex: 20,
            border: "2px solid var(--accent, #0a84ff)",
            background: "rgba(255, 254, 245, 0.97)",
            resize: "both",
            lineHeight: 1.3,
            padding: "2px 4px",
            borderRadius: 3,
            outline: "none",
            boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
          }}
        />
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

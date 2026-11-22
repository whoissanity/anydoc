"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "@/store/editor-store";
import { useIsCompact, useIsTouch } from "@/lib/use-media-query";
import { PdfPage } from "./PdfPage";
import { ReflowView } from "./ReflowView";

// US Letter at 72dpi — fallback page box if the real size can't be read from the proxy.
const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;

/** Mount a page when it is within this distance of the scroll viewport. */
const PAGE_ROOT_MARGIN = "1200px 1200px";

interface PageSize {
  w: number;
  h: number;
}

/**
 * One page slot. The placeholder always exists (so scroll position, page tracking and
 * scrollIntoView keep working), but `PdfPage` — and its canvas — only mounts while the
 * slot is near the viewport. A 1,000-page document therefore keeps a handful of canvases
 * alive instead of 1,000.
 */
export const PageSlot = memo(function PageSlot({
  pageNumber,
  scale,
  estimateW,
  estimateH,
  mounted,
  onVisibility,
  onMeasure,
}: {
  pageNumber: number;
  scale: number;
  estimateW: number;
  estimateH: number;
  mounted: boolean;
  onVisibility: (pageNumber: number, visible: boolean) => void;
  onMeasure: (pageNumber: number, width: number, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Very old browsers (or a test environment) have no observer: keep the old behaviour.
    if (typeof IntersectionObserver === "undefined") {
      onVisibility(pageNumber, true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        onVisibility(pageNumber, visible);
      },
      { root: el.closest(".document-canvas"), rootMargin: PAGE_ROOT_MARGIN, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisibility, pageNumber]);

  return (
    <div
      ref={ref}
      data-page={pageNumber}
      style={{
        width: estimateW,
        height: estimateH,
        flexShrink: 0,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {mounted ? (
        <PdfPage pageNumber={pageNumber} scale={scale} onMeasure={onMeasure} />
      ) : (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            borderRadius: 2,
            border: "1px solid var(--c-border-subtle)",
            backgroundColor: "var(--c-surface-raised)",
            color: "var(--c-text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {pageNumber}
        </div>
      )}
    </div>
  );
});

export function PdfViewer() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(
    null
  );
  const pageCount = useEditorStore((s) => s.pageCount);
  const currentPage = useEditorStore((s) => s.currentPage);
  const zoom = useEditorStore((s) => s.zoom);
  const zoomMode = useEditorStore((s) => s.zoomMode);
  const viewMode = useEditorStore((s) => s.viewMode);
  const tool = useEditorStore((s) => s.tool);
  const toolRef = useRef(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const setZoom = useEditorStore((s) => s.setZoom);
  const pdfDocProxy = useEditorStore((s) => s.pdfDocProxy);
  const isCompact = useIsCompact();
  const isTouch = useIsTouch();

  // Virtualization state. Sizes are stored at scale 1 so zoom changes do not invalidate them.
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [basePageSize, setBasePageSize] = useState<PageSize>({
    w: LETTER_WIDTH,
    h: LETTER_HEIGHT,
  });
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set());

  // A new document invalidates measurements and any mounted canvases.
  useEffect(() => {
    setPageSizes({});
    setVisiblePages(new Set([1]));
    setBasePageSize({ w: LETTER_WIDTH, h: LETTER_HEIGHT });
    const proxy = pdfDocProxy as {
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
      }>;
    } | null;
    if (!proxy) return;
    let cancelled = false;
    proxy
      .getPage(1)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        setBasePageSize({ w: viewport.width, h: viewport.height });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pdfDocProxy, pageCount]);

  const handleVisibility = useCallback((pageNumber: number, visible: boolean) => {
    setVisiblePages((prev) => {
      const next = new Set(prev);
      if (visible) next.add(pageNumber);
      else next.delete(pageNumber);
      return next;
    });
  }, []);

  const handleMeasure = useCallback(
    (pageNumber: number, width: number, height: number) => {
      if (!(zoom > 0)) return;
      const base = { w: width / zoom, h: height / zoom };
      setPageSizes((prev) => {
        const current = prev[pageNumber];
        if (
          current &&
          Math.abs(current.w - base.w) < 0.5 &&
          Math.abs(current.h - base.h) < 0.5
        ) {
          return prev;
        }
        return { ...prev, [pageNumber]: base };
      });
    },
    [zoom]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Spread mode: turn a vertical wheel into horizontal scroll so it moves sideways.
      if (viewMode === "spread" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        const next = Math.min(4, Math.max(0.25, useEditorStore.getState().zoom + delta));
        setZoom(Number(next.toFixed(2)));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom, viewMode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || zoomMode === "custom") return;
    const gutter = isCompact ? 24 : 64;
    const w = el.clientWidth - gutter;
    const h = el.clientHeight - gutter;
    if (w <= 0 || h <= 0) return;

    let cancelled = false;
    // Fit against the page's real box so A4, landscape and custom sizes work, not just letter.
    const apply = (pageWidth: number, pageHeight: number) => {
      const baseWidth = viewMode === "spread" ? pageWidth * 2 : pageWidth;
      const scale = zoomMode === "fit-width" ? w / baseWidth : Math.min(w / baseWidth, h / pageHeight);
      const min = zoomMode === "fit-page" ? 0.25 : 0.3;
      setZoom(Number(Math.max(min, scale).toFixed(2)));
    };

    const proxy = pdfDocProxy as {
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
      }>;
    } | null;

    if (!proxy) {
      apply(LETTER_WIDTH, LETTER_HEIGHT);
      return;
    }
    proxy
      .getPage(currentPage)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        apply(viewport.width, viewport.height);
      })
      .catch(() => {
        if (!cancelled) apply(LETTER_WIDTH, LETTER_HEIGHT);
      });

    return () => {
      cancelled = true;
    };
    // pageCount/pdfDocProxy re-run this on a new document so its first render is already fitted.
  }, [zoomMode, viewMode, pageCount, currentPage, pdfDocProxy, setZoom, isCompact]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || viewMode === "continuous") return;
    // A page-follow scroll must not fight a hand-tool pan in progress.
    if (panRef.current) return;
    const pageEl = el.querySelector(`[data-page="${currentPage}"]`);
    pageEl?.scrollIntoView({
      block: "nearest",
      inline: viewMode === "spread" ? "center" : "nearest",
      behavior: "smooth",
    });
  }, [currentPage, viewMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewMode === "presentation") {
        // Never hijack keys from a field the user is typing in (e.g. space in a text box).
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || active?.isContentEditable) return;
        if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
          e.preventDefault();
          setCurrentPage(Math.min(pageCount, currentPage + 1));
        }
        if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          setCurrentPage(Math.max(1, currentPage - 1));
        }
        if (e.key === "Escape") {
          useEditorStore.getState().setViewMode("continuous");
          document.exitFullscreen?.();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewMode, currentPage, pageCount, setCurrentPage]);

  useEffect(() => {
    if (viewMode === "presentation") {
      scrollRef.current?.requestFullscreen?.().catch(() => undefined);
    }
  }, [viewMode]);

  // Hand tool: drag the viewport itself. The down-event is captured at the window in the
  // capture phase so child overlays (images, form fields) that call stopPropagation on
  // their own pointerdown can't prevent the pan from starting.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (toolRef.current !== "hand") return;
      const el = scrollRef.current;
      if (!el) return;
      // Only start a pan when the press lands on the document canvas (not on chrome).
      if (!el.contains(e.target as Node) && e.target !== el) return;
      // A placed object keeps its own drag/rotate gesture even in hand mode; only empty
      // page areas pan.
      const target = e.target as Element | null;
      if (target?.closest?.(".text-object-overlay, .form-field-overlay")) return;
      e.preventDefault();
      // Capture-phase stop prevents child overlays (images, form fields) from starting
      // their own drag; only the pan runs.
      e.stopPropagation();
      panRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: el.scrollLeft,
        top: el.scrollTop,
      };
    };
    const onMove = (e: PointerEvent) => {
      const pan = panRef.current;
      const el = scrollRef.current;
      if (!pan || !el || pan.pointerId !== e.pointerId) return;
      el.scrollLeft = pan.left - (e.clientX - pan.x);
      el.scrollTop = pan.top - (e.clientY - pan.y);
    };
    const onEnd = (e: PointerEvent) => {
      if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, []);

  // Touch: one finger pans (or swipes pages in single/presentation), two fingers pinch
  // around the gesture midpoint, and a double tap toggles 1x / 2x. The browser's own
  // pinch-zoom is disabled on the canvas so the document zooms instead of the page.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isTouch) return;

    type Mode = "none" | "pan" | "pinch";
    let mode: Mode = "none";
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startDistance = 1;
    let startZoom = 1;
    let lastTap = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let moved = false;

    const distance = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        mode = "pan";
        moved = false;
        startX = touch.clientX;
        startY = touch.clientY;
        startLeft = el.scrollLeft;
        startTop = el.scrollTop;
      } else if (event.touches.length === 2) {
        const [a, b] = [event.touches[0], event.touches[1]];
        mode = "pinch";
        startDistance = Math.max(1, distance(a, b));
        startZoom = useEditorStore.getState().zoom;
        startLeft = el.scrollLeft;
        startTop = el.scrollTop;
      }
    };

    const onMove = (event: TouchEvent) => {
      if (mode === "pan" && event.touches.length === 1) {
        const touch = event.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;

        // The hand tool owns pointer panning; single/presentation swipes change page.
        if (useEditorStore.getState().tool === "hand") return;
        if (viewMode === "single" || viewMode === "presentation") return;

        event.preventDefault();
        el.scrollLeft = startLeft - dx;
        el.scrollTop = startTop - dy;
        return;
      }

      if (mode === "pinch" && event.touches.length === 2) {
        event.preventDefault();
        const [a, b] = [event.touches[0], event.touches[1]];
        const next = Math.min(4, Math.max(0.25, startZoom * (distance(a, b) / startDistance)));
        const rect = el.getBoundingClientRect();
        const offsetX = (a.clientX + b.clientX) / 2 - rect.left;
        const offsetY = (a.clientY + b.clientY) / 2 - rect.top;
        const contentX = startLeft + offsetX;
        const contentY = startTop + offsetY;
        const ratio = next / startZoom;

        setZoom(Number(next.toFixed(2)));
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, contentX * ratio - offsetX);
          el.scrollTop = Math.max(0, contentY * ratio - offsetY);
        });
      }
    };

    const onEnd = (event: TouchEvent) => {
      if (mode === "pan" && event.touches.length === 0) {
        const touch = event.changedTouches[0];
        const handTool = useEditorStore.getState().tool === "hand";
        if (touch && !handTool) {
          const now = Date.now();
          const doubleTap =
            now - lastTap < 320 &&
            Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY) < 30;

          if (!moved && doubleTap) {
            const current = useEditorStore.getState().zoom;
            setZoom(current > 1.2 ? 1 : 2);
            lastTap = 0;
          } else if (!moved) {
            lastTap = now;
            lastTapX = touch.clientX;
            lastTapY = touch.clientY;
          } else if (viewMode === "single" || viewMode === "presentation") {
            const dx = touch.clientX - startX;
            if (Math.abs(dx) > 60) {
              const current = useEditorStore.getState().currentPage;
              setCurrentPage(dx < 0 ? Math.min(pageCount, current + 1) : Math.max(1, current - 1));
            }
          }
        }
      }
      if (event.touches.length === 0) mode = "none";
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [isTouch, viewMode, pageCount, setCurrentPage, setZoom]);

  // Page pairs for spread mode ([1], [2,3]...); single pages for continuous/single.
  // Keep the long arrays stable: they must not be rebuilt on every scroll-driven page change.
  const individualPages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => [i + 1]),
    [pageCount]
  );
  const spreadPages = useMemo(() => {
    const list: number[][] = [];
    // Cover page (page 1) as a standalone right page or pair
    list.push([1]);
    for (let p = 2; p <= pageCount; p += 2) {
      if (p + 1 <= pageCount) {
        list.push([p, p + 1]);
      } else {
        list.push([p]);
      }
    }
    return list;
  }, [pageCount]);

  const spreads =
    viewMode === "single" || viewMode === "presentation"
      ? [[currentPage]]
      : viewMode === "spread"
        ? spreadPages
        : individualPages;

  if (!pageCount) return null;
  if (viewMode === "reflow") return <ReflowView />;

  return (
    <div
      ref={scrollRef}
      className="document-canvas"
      onScroll={() => {
        const el = scrollRef.current;
        if (!el) return;
        const pageEls = el.querySelectorAll("[data-page]");
        if (pageEls.length === 0) return;
        const elRect = el.getBoundingClientRect();
        let best = currentPage;
        let bestDist = Infinity;
        pageEls.forEach((node) => {
          const r = (node as HTMLElement).getBoundingClientRect();
          const containerCenter = viewMode === "spread"
            ? elRect.left + elRect.width / 2
            : elRect.top + elRect.height / 2;
          const nodeCenter = viewMode === "spread"
            ? r.left + r.width / 2
            : r.top + r.height / 2;
          const dist = Math.abs(nodeCenter - containerCenter);
          const n = Number((node as HTMLElement).dataset.page);
          if (dist < bestDist) {
            bestDist = dist;
            best = n;
          }
        });
        if (best !== currentPage) setCurrentPage(best);
      }}
      style={{
        flex: 1,
        overflow: "auto",
        backgroundColor: viewMode === "presentation" ? "#000000" : "var(--c-bg)",
        padding: viewMode === "presentation" ? 0 : "24px 32px",
        cursor: tool === "hand" ? "grab" : undefined,
        userSelect: tool === "hand" ? "none" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: viewMode === "spread" ? "row" : "column",
          gap: viewMode === "spread" ? 48 : 24,
          alignItems: "center",
          justifyContent: viewMode === "presentation" || viewMode === "single" ? "center" : "flex-start",
          minHeight: "100%",
          minWidth: viewMode === "spread" ? "max-content" : undefined,
        }}
      >
        {spreads.map((pair, idx) => (
          <div
            key={`spread-${idx}`}
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 2,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {pair.map((n) => {
              const base = pageSizes[n] ?? basePageSize;
              const estimate = {
                w: Math.max(1, base.w * zoom),
                h: Math.max(1, base.h * zoom),
              };
              return (
                <PageSlot
                  key={n}
                  pageNumber={n}
                  scale={zoom}
                  estimateW={estimate.w}
                  estimateH={estimate.h}
                  mounted={visiblePages.has(n) || n === currentPage}
                  onVisibility={handleVisibility}
                  onMeasure={handleMeasure}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

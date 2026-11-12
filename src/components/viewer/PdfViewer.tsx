"use client";

import { useEffect, useMemo, useRef } from "react";
import { useEditorStore } from "@/store/editor-store";
import { PdfPage } from "./PdfPage";

// US Letter at 72dpi — fallback page box if the real size can't be read from the proxy.
const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;

export function PdfViewer() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageCount = useEditorStore((s) => s.pageCount);
  const currentPage = useEditorStore((s) => s.currentPage);
  const zoom = useEditorStore((s) => s.zoom);
  const zoomMode = useEditorStore((s) => s.zoomMode);
  const viewMode = useEditorStore((s) => s.viewMode);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const setZoom = useEditorStore((s) => s.setZoom);
  const pdfDocProxy = useEditorStore((s) => s.pdfDocProxy);

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
    const w = el.clientWidth - 64;
    const h = el.clientHeight - 64;
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
  }, [zoomMode, viewMode, pageCount, currentPage, pdfDocProxy, setZoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || viewMode === "continuous") return;
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

  // Page pairs for spread mode ([1], [2,3]...); single pages for continuous/single.
  const spreads = useMemo(() => {
    if (viewMode === "single" || viewMode === "presentation") {
      return [[currentPage]];
    }
    if (viewMode === "spread") {
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
    }
    // continuous mode: single array of individual pages
    return Array.from({ length: pageCount }, (_, i) => [i + 1]);
  }, [viewMode, currentPage, pageCount]);

  if (!pageCount) return null;

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
            {pair.map((n) => (
              <PdfPage key={`${n}-${zoom}`} pageNumber={n} scale={zoom} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

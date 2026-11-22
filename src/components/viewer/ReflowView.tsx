"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useEditorStore } from "@/store/editor-store";
import { reflowText, type ReflowTextItem } from "@/lib/document/reflow";
import { ensureScriptsForText } from "@/lib/fonts/scripts";

interface TextContentPage {
  getTextContent: () => Promise<{ items: ReflowTextItem[] }>;
}

interface TextDocProxy {
  getPage: (pageNumber: number) => Promise<TextContentPage>;
}

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 32;
const FONT_STEP = 1;

function clampFontSize(value: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
}

/** One page of extracted text; extraction starts when the page nears the viewport. */
function ReflowPage({
  pageNumber,
  fontSize,
  text,
  loading,
  error,
  register,
  unregister,
  onVisible,
}: {
  pageNumber: number;
  fontSize: number;
  text: string | undefined;
  loading: boolean;
  error: boolean;
  register: (pageNumber: number, el: HTMLElement) => void;
  unregister: (pageNumber: number) => void;
  onVisible: (pageNumber: number) => void;
}) {
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      if (el) register(pageNumber, el);
      else unregister(pageNumber);
    },
    [pageNumber, register, unregister]
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") onVisible(pageNumber);
  }, [onVisible, pageNumber]);

  return (
    <article
      ref={setRef}
      data-reflow-page={pageNumber}
      aria-label={`Page ${pageNumber}`}
      style={{
        minHeight: 260,
        padding: "24px 18px 30px",
        borderBottom: "1px solid var(--c-border-subtle)",
        contentVisibility: "auto",
        containIntrinsicSize: "auto 260px",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          fontFamily: "var(--font-body)",
          fontSize,
          lineHeight: 1.65,
          color: "var(--c-text)",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          userSelect: "text",
        }}
      >
        {error ? (
          <span style={{ color: "var(--c-text-muted)" }}>Could not read this page’s text.</span>
        ) : text === undefined ? (
          <span style={{ color: "var(--c-text-muted)" }}>
            {loading ? "Extracting text…" : "Loading page…"}
          </span>
        ) : text.length > 0 ? (
          <span dir="auto">{text}</span>
        ) : (
          <span style={{ color: "var(--c-text-muted)" }}>No selectable text on this page.</span>
        )}
      </div>
      <div
        style={{
          maxWidth: 720,
          margin: "18px auto 0",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "var(--c-text-subtle)",
        }}
      >
        {pageNumber}
      </div>
    </article>
  );
}

/**
 * Text-only reading view. PDF.js text is rendered as ordinary selectable text; images,
 * exact glyph placement and page graphics are intentionally omitted.
 */
export function ReflowView() {
  const pdfDocProxy = useEditorStore((s) => s.pdfDocProxy);
  const pageCount = useEditorStore((s) => s.pageCount);
  const [fontSize, setFontSize] = useState(16);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const stateRef = useRef({ texts, loading, errors });
  const observerRef = useRef<IntersectionObserver | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLElement>());
  const pending = useRef(new Set<number>());
  const docGeneration = useRef(0);

  useEffect(() => {
    stateRef.current = { texts, loading, errors };
  }, [texts, loading, errors]);

  useEffect(() => {
    docGeneration.current += 1;
    const cleared = { texts: {}, loading: {}, errors: {} };
    stateRef.current = cleared;
    setTexts(cleared.texts);
    setLoading(cleared.loading);
    setErrors(cleared.errors);
    pending.current.clear();
  }, [pdfDocProxy]);

  const register = useCallback((pageNumber: number, el: HTMLElement) => {
    pageEls.current.set(pageNumber, el);
    observerRef.current?.observe(el);
  }, []);

  const unregister = useCallback((pageNumber: number) => {
    const el = pageEls.current.get(pageNumber);
    if (el) observerRef.current?.unobserve(el);
    pageEls.current.delete(pageNumber);
  }, []);

  const loadPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDocProxy) return;
      const current = stateRef.current;
      if (
        current.texts[pageNumber] !== undefined ||
        current.loading[pageNumber] ||
        current.errors[pageNumber] ||
        pending.current.has(pageNumber)
      ) {
        return;
      }

      pending.current.add(pageNumber);
      const generation = docGeneration.current;
      setLoading((prev) => ({ ...prev, [pageNumber]: true }));
      try {
        const doc = pdfDocProxy as TextDocProxy;
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        if (docGeneration.current !== generation) return;
        const text = reflowText(content.items ?? []);
        setTexts((prev) => ({ ...prev, [pageNumber]: text }));
        void ensureScriptsForText(text.slice(0, 50_000));
      } catch {
        if (docGeneration.current === generation) {
          setErrors((prev) => ({ ...prev, [pageNumber]: true }));
        }
      } finally {
        if (docGeneration.current === generation) {
          pending.current.delete(pageNumber);
          setLoading((prev) => ({ ...prev, [pageNumber]: false }));
        }
      }
    },
    [pdfDocProxy]
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageNumber = Number((entry.target as HTMLElement).dataset.reflowPage);
          if (Number.isFinite(pageNumber) && pageNumber > 0) {
            void loadPage(pageNumber);
            observer.unobserve(entry.target);
          }
        }
      },
      { root: rootRef.current, rootMargin: "800px 0px", threshold: 0 }
    );

    observerRef.current = observer;
    for (const el of pageEls.current.values()) observer.observe(el);

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [loadPage]);

  return (
    <div
      ref={rootRef}
      className="reflow-view"
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        backgroundColor: "var(--c-bg)",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        className="reflow-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          backgroundColor: "var(--c-surface)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          boxShadow: "var(--shadow-divider-b)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text)" }}>Text reflow</div>
          <div style={{ fontSize: 10.5, color: "var(--c-text-muted)" }}>
            Text only — images and exact layout are not shown.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            aria-label="Decrease text size"
            onClick={() => setFontSize((size) => clampFontSize(size - FONT_STEP))}
            disabled={fontSize <= MIN_FONT_SIZE}
            style={reflowButton}
          >
            A-
          </button>
          <span
            aria-live="polite"
            style={{
              minWidth: 40,
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--c-text)",
            }}
          >
            {fontSize}px
          </span>
          <button
            type="button"
            aria-label="Increase text size"
            onClick={() => setFontSize((size) => clampFontSize(size + FONT_STEP))}
            disabled={fontSize >= MAX_FONT_SIZE}
            style={reflowButton}
          >
            A+
          </button>
        </div>
      </div>

      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNumber) => (
        <ReflowPage
          key={pageNumber}
          pageNumber={pageNumber}
          fontSize={fontSize}
          text={texts[pageNumber]}
          loading={!!loading[pageNumber]}
          error={!!errors[pageNumber]}
          register={register}
          unregister={unregister}
          onVisible={loadPage}
        />
      ))}
    </div>
  );
}

const reflowButton: CSSProperties = {
  minWidth: 44,
  height: 44,
  padding: "0 8px",
  border: "1px solid var(--c-border-subtle)",
  borderRadius: "var(--radius-input)",
  backgroundColor: "var(--c-surface-raised)",
  color: "var(--c-text)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
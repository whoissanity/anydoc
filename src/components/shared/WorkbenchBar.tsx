"use client";

import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/editor-store";
import { pickImageToInsert } from "@/lib/edit/insert-image";
import {
  MAX_TEXT_FONT_SIZE,
  MIN_TEXT_FONT_SIZE,
  TEXT_FONT_CHOICES,
} from "@/lib/text/fonts";
import type { TextEditSession } from "@/lib/types";
import { useI18n } from "@/components/providers/I18nProvider";
import { useIsCompact } from "@/lib/use-media-query";
import { redo, undo } from "@/lib/editor/history";
import {
  buildSearchIndex,
  findMatches,
  type SearchHit,
  type SearchIndex,
  type SearchOptions,
} from "@/lib/document/search";
import { LanguageSelector } from "./LanguageSelector";
import { OcrLanguageSelector } from "./OcrLanguageSelector";
import {
  BookOpen,
  LayoutGrid,
  Wrench,
  Search,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Columns2,
  Rows3,
  Square,
  Presentation,
  Type,
  ImageIcon,
  ImagePlus,
  MousePointer2,
  Hand,
  Save,
  Download,
  X,
  RotateCcw,
  RotateCw,
  Plus,
  Minus,
  Trash2,
  FileOutput,
  ScanText,
  Stamp,
  FormInput,
  Sun,
  Moon,
  Highlighter,
  Underline,
  Strikethrough,
  StickyNote,
  PenTool,
  ShieldAlert,
  AlignLeft,
} from "lucide-react";

interface ActionBtnProps {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
  danger?: boolean;
  highlight?: boolean;
}

export function ActionBtn({
  title,
  active,
  disabled,
  onClick,
  icon,
  label,
  danger,
  highlight,
}: ActionBtnProps) {
  return (
    <button
      type="button"
      className="action-btn"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: 28,
        minWidth: 28,
        padding: label ? "0 10px" : "0 7px",
        borderRadius: "var(--radius-btn)",
        fontSize: 13,
        fontWeight: 500,
        backgroundColor: active
          ? "var(--c-surface-raised)"
          : highlight
          ? "var(--c-btn-bg)"
          : "transparent",
        boxShadow: active || highlight ? "var(--shadow-raised-sm)" : "none",
        color: danger
          ? "var(--danger)"
          : highlight
          ? "var(--c-btn-text)"
          : active
          ? "var(--c-icon-active)"
          : disabled
          ? "var(--c-icon-disabled)"
          : "var(--c-icon-idle)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 120ms ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled && !highlight) {
          e.currentTarget.style.color = danger ? "var(--danger)" : "var(--c-icon-hover)";
          e.currentTarget.style.backgroundColor = "var(--c-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled && !highlight) {
          e.currentTarget.style.color = danger ? "var(--danger)" : "var(--c-icon-idle)";
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

const MARKUP_PRESETS = ["#FFD600", "#30D158", "#0A84FF", "#FF453A", "#BF5AF2", "#FF9F0A"];

// Colour and opacity controls for the active text markup tool.
function MarkupColorControls() {
  const tool = useEditorStore((s) => s.tool);
  const annotColor = useEditorStore((s) => s.annotColor);
  const underlineColor = useEditorStore((s) => s.underlineColor);
  const strikeColor = useEditorStore((s) => s.strikeColor);
  const markupOpacity = useEditorStore((s) => s.markupOpacity);
  const setAnnotColorFor = useEditorStore((s) => s.setAnnotColorFor);
  const setMarkupOpacity = useEditorStore((s) => s.setMarkupOpacity);

  if (tool !== "highlight" && tool !== "underline" && tool !== "strikethrough") {
    return null;
  }

  const type = tool;
  const current =
    type === "highlight" ? annotColor : type === "underline" ? underlineColor : strikeColor;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--c-text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {type === "highlight" ? "Highlight" : type === "underline" ? "Underline" : "Strike"}
      </span>
      <div style={{ display: "flex", gap: 3 }}>
        {MARKUP_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            title={`Use ${color}`}
            aria-label={`${type} colour ${color}`}
            onClick={() => setAnnotColorFor(type, color)}
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              backgroundColor: color,
              border:
                current.toLowerCase() === color.toLowerCase()
                  ? "2px solid var(--c-text)"
                  : "1px solid var(--c-border-strong)",
              boxShadow: "var(--shadow-raised-sm)",
              transition: "transform 120ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
          />
        ))}
      </div>
      <input
        type="color"
        value={current}
        title="Custom colour"
        aria-label="Custom markup colour"
        onChange={(e) => setAnnotColorFor(type, e.target.value)}
        style={{
          width: 22,
          height: 20,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
      />
      {type === "highlight" && (
        <input
          type="range"
          min={0.15}
          max={0.9}
          step={0.05}
          value={markupOpacity}
          title={`Highlight opacity ${Math.round(markupOpacity * 100)}%`}
          aria-label="Highlight opacity"
          onChange={(e) => setMarkupOpacity(Number(e.target.value))}
          style={{ width: 62, accentColor: "var(--c-primary)" }}
        />
      )}
    </div>
  );
}

const DRAW_PRESETS = ["#1a6eff", "#FF453A", "#30D158", "#FFD600", "#BF5AF2", "#FF9F0A", "#FFFFFF", "#000000"];

// Colour controls for the freehand draw/ink tool.
function DrawColorControls() {
  const tool = useEditorStore((s) => s.tool);
  const drawColor = useEditorStore((s) => s.drawColor);
  const setDrawColor = useEditorStore((s) => s.setDrawColor);

  if (tool !== "draw") {
    return null;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--c-text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Ink
      </span>
      <div style={{ display: "flex", gap: 3 }}>
        {DRAW_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            title={`Use ${color}`}
            aria-label={`Ink colour ${color}`}
            onClick={() => setDrawColor(color)}
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              backgroundColor: color,
              border:
                drawColor.toLowerCase() === color.toLowerCase()
                  ? "2px solid var(--c-text)"
                  : "1px solid var(--c-border-strong)",
              boxShadow: "var(--shadow-raised-sm)",
              transition: "transform 120ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
          />
        ))}
      </div>
      <input
        type="color"
        value={drawColor}
        title="Custom colour"
        aria-label="Custom ink colour"
        onChange={(e) => setDrawColor(e.target.value)}
        style={{
          width: 22,
          height: 20,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
      />
    </div>
  );
}

/** Font, size and colour for the text box that is currently being edited. */
function TextStyleControls() {
  const textEdit = useEditorStore((s) => s.textEdit);
  const selectedTextId = useEditorStore((s) => s.selectedTextId);
  const textObjects = useEditorStore((s) => s.textObjects);

  // Either the box being typed in or the one selected on the page.
  const active = textEdit ?? textObjects.find((t) => t.id === selectedTextId);
  if (!active) return null;

  const patch = (p: Partial<TextEditSession>) => {
    const store = useEditorStore.getState();
    if (store.textEdit) {
      store.setTextEdit({ ...store.textEdit, ...p });
    } else if (store.selectedTextId) {
      store.updateTextObject(store.selectedTextId, p);
    }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--c-text-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Text
        </span>
        <select
          aria-label="Text font"
          title="Text font"
          value={active.fontFamily}
          onChange={(e) => patch({ fontFamily: e.target.value })}
          style={{
            height: 22,
            maxWidth: 96,
            fontSize: 11,
            background: "transparent",
            color: "inherit",
            border: "none",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {TEXT_FONT_CHOICES.map((f) => (
            <option key={f.label} value={f.value} style={{ color: "#111" }}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Decrease text size"
          title="Decrease text size"
          onClick={() =>
            patch({ fontSize: Math.max(MIN_TEXT_FONT_SIZE, active.fontSize - 1) })
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 6,
            color: "var(--c-icon-idle)",
          }}
        >
          <Minus size={12} />
        </button>
        <span className="text-style-value">{Math.round(active.fontSize)}</span>
        <button
          type="button"
          aria-label="Increase text size"
          title="Increase text size"
          onClick={() =>
            patch({ fontSize: Math.min(MAX_TEXT_FONT_SIZE, active.fontSize + 1) })
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 6,
            color: "var(--c-icon-idle)",
          }}
        >
          <Plus size={12} />
        </button>
        <button
          type="button"
          aria-label="Toggle bold"
          title="Bold"
          aria-pressed={!!active.bold}
          onClick={() => patch({ bold: !active.bold })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 6,
            fontWeight: 800,
            color: active.bold ? "var(--c-text)" : "var(--c-icon-idle)",
            background: active.bold ? "var(--c-hover)" : "transparent",
          }}
        >
          B
        </button>
        <input
          type="color"
          aria-label="Text colour"
          title="Text colour"
          value={active.color}
          onChange={(e) => patch({ color: e.target.value })}
          style={{
            width: 22,
            height: 20,
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
          <span style={{ fontSize: 10, color: "var(--c-text-subtle)" }}>Rotate</span>
          <select
            aria-label="Text rotation"
            title="Text rotation"
            value={active.rotation ?? 0}
            onChange={(e) => patch({ rotation: Number(e.target.value) })}
            style={{
              height: 22,
              fontSize: 11,
              background: "transparent",
              color: "inherit",
              border: "none",
              outline: "none",
              cursor: "pointer",
              width: 70,
            }}
          >
            <option value={0}>0°</option>
            <option value={15}>15°</option>
            <option value={30}>30°</option>
            <option value={45}>45°</option>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
            <option value={345}>-15°</option>
            <option value={330}>-30°</option>
            <option value={315}>-45°</option>
          </select>
        </span>
      </div>
      <div
        style={{
          width: 1,
          height: 14,
          backgroundColor: "var(--c-border-subtle)",
          margin: "0 4px",
        }}
      />
    </>
  );
}

export function WorkbenchBar({
  onSave,
  onDownload,
  onCloseDocument,
  onPageAction,
}: {
  onSave?: () => void;
  onDownload?: () => void;
  onCloseDocument?: () => void;
  onPageAction?: (action: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCrowded, setIsCrowded] = useState(false);
  const { t } = useI18n();
  const isCompact = useIsCompact();

  const theme = useEditorStore((s) => s.theme);
  const toggleTheme = useEditorStore((s) => s.toggleTheme);
  const currentView = useEditorStore((s) => s.currentView);
  const setCurrentView = useEditorStore((s) => s.setCurrentView);
  const fileName = useEditorStore((s) => s.fileName);
  const dirty = useEditorStore((s) => s.dirty);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setZoomMode = useEditorStore((s) => s.setZoomMode);
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const tool = useEditorStore((s) => s.tool);
  const toggleTool = useEditorStore((s) => s.toggleTool);
  const redactions = useEditorStore((s) => s.redactions);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);
  const history = useEditorStore((s) => s.history);
  const historyIndex = useEditorStore((s) => s.historyIndex);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;
  const historyBusy = useEditorStore((s) => s.activeDialog === "tool");
  const undoLabel = canUndo ? history[historyIndex - 1]?.label : null;
  const redoLabel = canRedo ? history[historyIndex + 1]?.label : null;
  const searchQuery = useEditorStore((s) => s.searchQuery);
  const setSearchQuery = useEditorStore((s) => s.setSearchQuery);
  const pdfDocProxy = useEditorStore((s) => s.pdfDocProxy);
  const pageCount = useEditorStore((s) => s.pageCount);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const setActiveDialog = useEditorStore((s) => s.setActiveDialog);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    diacritics: true,
  });
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const indexRef = useRef<{ doc: unknown; index: SearchIndex } | null>(null);

  // Responsive reflow: ResizeObserver detects crowding (< 740px) (R4)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setIsCrowded(width < 740);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    // Check if query is page number e.g. "p4" or "#4" or "4"
    const pageMatch = query.match(/^#?p?(\d+)$/i);
    if (pageMatch) {
      const pageNum = parseInt(pageMatch[1], 10);
      if (pageNum >= 1 && pageNum <= pageCount) {
        setCurrentPage(pageNum);
        useEditorStore.getState().setStatus(`Jumped to page ${pageNum}`);
        return;
      }
    }

    setShowSearch(query.length >= 2);
    if (query.length >= 2) setSearching(true);
  };

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2 || !pdfDocProxy) {
      setSearchHits([]);
      setShowSearch(false);
      setSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setSearching(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          let cached = indexRef.current;
          if (!cached || cached.doc !== pdfDocProxy) {
            const index = await buildSearchIndex(pdfDocProxy as never, controller.signal);
            cached = { doc: pdfDocProxy, index };
            indexRef.current = cached;
          }
          if (cancelled) return;
          setSearchHits(findMatches(cached.index, query, searchOptions));
          setShowSearch(true);
        } catch (error) {
          if (!cancelled) setSearchError(error instanceof Error ? error.message : "Search failed");
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery, searchOptions, pdfDocProxy]);

  const jumpToHit = (hit: SearchHit) => {
    setCurrentPage(hit.pageIndex + 1);
    setShowSearch(false);
    useEditorStore.getState().setStatus(`Found on page ${hit.pageIndex + 1}`);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-page="${hit.pageIndex + 1}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  return (
    <header
      ref={containerRef}
      className="workbench-bar"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--c-surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        boxShadow: "var(--shadow-divider-b)",
        flexShrink: 0,
        zIndex: 30,
        userSelect: "none",
      }}
    >
      <div
        className="workbench-bar-row"
        style={{
          height: "var(--bar-h)",
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 8,
          justifyContent: isCompact ? "flex-start" : "space-between",
          overflowX: isCompact ? "auto" : "visible",
        }}
      >
        <div
          className="workbench-bar-views"
          style={{
            display: isCompact ? "none" : "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setCurrentView("viewer")}
            disabled={!hasDoc}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: "var(--radius-btn)",
              fontSize: 13,
              fontWeight: currentView === "viewer" ? 600 : 500,
              color:
                currentView === "viewer"
                  ? "var(--c-icon-active)"
                  : !hasDoc
                  ? "var(--c-icon-disabled)"
                  : "var(--c-icon-idle)",
              backgroundColor:
                currentView === "viewer" ? "var(--c-surface-raised)" : "transparent",
              boxShadow: currentView === "viewer" ? "var(--shadow-raised-sm)" : "none",
              cursor: hasDoc ? "pointer" : "not-allowed",
              transition: "all 120ms ease",
            }}
          >
            <BookOpen size={15} strokeWidth={1.85} />
            <span>{t("toolbar.viewer")}</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentView("pageEditor")}
            disabled={!hasDoc}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: "var(--radius-btn)",
              fontSize: 13,
              fontWeight: currentView === "pageEditor" ? 600 : 500,
              color:
                currentView === "pageEditor"
                  ? "var(--c-icon-active)"
                  : !hasDoc
                  ? "var(--c-icon-disabled)"
                  : "var(--c-icon-idle)",
              backgroundColor:
                currentView === "pageEditor" ? "var(--c-surface-raised)" : "transparent",
              boxShadow: currentView === "pageEditor" ? "var(--shadow-raised-sm)" : "none",
              cursor: hasDoc ? "pointer" : "not-allowed",
              transition: "all 120ms ease",
            }}
          >
            <LayoutGrid size={15} strokeWidth={1.85} />
            <span>{t("toolbar.organize")}</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentView("fileEditor")}
            disabled={!hasDoc}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: "var(--radius-btn)",
              fontSize: 13,
              fontWeight: currentView === "fileEditor" ? 600 : 500,
              color:
                currentView === "fileEditor"
                  ? "var(--c-icon-active)"
                  : !hasDoc
                  ? "var(--c-icon-disabled)"
                  : "var(--c-icon-idle)",
              backgroundColor:
                currentView === "fileEditor" ? "var(--c-surface-raised)" : "transparent",
              boxShadow: currentView === "fileEditor" ? "var(--shadow-raised-sm)" : "none",
              cursor: hasDoc ? "pointer" : "not-allowed",
              transition: "all 120ms ease",
            }}
          >
            <Wrench size={15} strokeWidth={1.85} />
            <span>{t("toolbar.tools")}</span>
          </button>
        </div>

        {/* Center search, moved to its own row below when crowded. */}
        {!isCrowded && (
          <form
            onSubmit={handleSearchSubmit}
            style={{
              flex: "0 1 320px",
              display: "flex",
              alignItems: "center",
              position: "relative",
            }}
          >
            <Search
              size={14}
              strokeWidth={1.5}
              style={{
                position: "absolute",
                left: 10,
                color: "var(--c-text-subtle)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder={t("nav.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: 28,
                backgroundColor: "var(--c-surface-sunken)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "0 28px 0 32px",
                fontSize: 12,
                color: "var(--c-text)",
                outline: "none",
                boxShadow: "inset 0 1px 2px rgba(45, 30, 15, 0.08)",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  color: "var(--c-text-subtle)",
                  padding: 2,
                }}
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
          </form>
        )}

        <div
          className="workbench-bar-actions"
          style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
        >
          {hasDoc && fileName && !isCompact && (
            <div
              className="workbench-bar-file"
              title={fileName}
              style={{
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--c-text)",
                padding: "3px 10px",
                borderRadius: "var(--radius-btn)",
                backgroundColor: "var(--c-surface-raised)",
                boxShadow: "var(--shadow-raised-sm)",
              }}
            >
              {fileName}
            </div>
          )}

          {hasDoc && currentView === "viewer" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                paddingLeft: 6,
                marginLeft: 2,
              }}
            >
              <ActionBtn
                title={t("nav.zoomOut")}
                icon={<ZoomOut size={15} strokeWidth={1.85} />}
                onClick={() => setZoom(Math.max(0.25, Number((zoom - 0.1).toFixed(2))))}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--c-text)",
                  minWidth: 38,
                  textAlign: "center",
                }}
              >
                {Math.round(zoom * 100)}%
              </span>
              <ActionBtn
                title={t("nav.zoomIn")}
                icon={<ZoomIn size={15} strokeWidth={1.85} />}
                onClick={() => setZoom(Math.min(4, Number((zoom + 0.1).toFixed(2))))}
              />
              <ActionBtn
                title={t("nav.fitWidth")}
                icon={<Maximize2 size={15} strokeWidth={1.85} />}
                onClick={() => setZoomMode("fit-width")}
              />
            </div>
          )}

          {hasDoc && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                paddingLeft: 6,
                marginLeft: 2,
              }}
            >
              <ActionBtn
                title={undoLabel ? `Undo: ${undoLabel}` : t("nav.nothingToUndo")}
                icon={<Undo2 size={15} strokeWidth={1.85} />}
                label={t("nav.undo")}
                disabled={!canUndo || historyBusy}
                onClick={() => void undo()}
              />
              <ActionBtn
                title={redoLabel ? `Redo: ${redoLabel}` : t("nav.nothingToRedo")}
                icon={<Redo2 size={15} strokeWidth={1.85} />}
                label={t("nav.redo")}
                disabled={!canRedo || historyBusy}
                onClick={() => void redo()}
              />
              <button
                type="button"
                title={dirty ? t("nav.saveChanges") : t("nav.save")}
                onClick={() => onSave?.()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 28,
                  padding: "0 12px",
                  borderRadius: "var(--radius-btn)",
                  backgroundColor: "var(--c-btn-bg)",
                  color: "var(--c-btn-text)",
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: "var(--shadow-raised-sm)",
                  transition: "background-color 120ms ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--c-btn-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--c-btn-bg)")}
              >
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Save size={14} strokeWidth={1.85} />
                  {dirty && (
                    <span
                      style={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        backgroundColor: "var(--warning)",
                      }}
                    />
                  )}
                </div>
                <span>Save</span>
              </button>

              <button
                type="button"
                title={t("nav.export")}
                onClick={() => {
                  if (onDownload) {
                    onDownload();
                  } else {
                    setActiveDialog("convert");
                  }
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 28,
                  padding: "0 10px",
                  borderRadius: "var(--radius-btn)",
                  backgroundColor: "var(--c-surface-raised)",
                  color: "var(--c-text)",
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: "var(--shadow-raised-sm)",
                  transition: "background-color 120ms ease",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--c-surface-elevated)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--c-surface-raised)")
                }
              >
                <Download size={14} strokeWidth={1.85} />
                <span>Export</span>
              </button>

              <ActionBtn
                title={t("nav.close")}
                danger
                icon={<X size={15} strokeWidth={1.85} />}
                onClick={() => {
                  if (onCloseDocument) {
                    onCloseDocument();
                  } else {
                    useEditorStore.getState().resetDocument();
                  }
                }}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginLeft: 2,
            }}
          >
            <LanguageSelector />
            <ActionBtn
              title={theme === "dark" ? "Switch to warm sand theme" : "Switch to Apple dark mode"}
              icon={
                theme === "dark" ? (
                  <Sun size={15} strokeWidth={1.5} style={{ color: "var(--c-accent-orange)" }} />
                ) : (
                  <Moon size={15} strokeWidth={1.5} style={{ color: "var(--c-text)" }} />
                )
              }
              onClick={toggleTheme}
            />
          </div>
        </div>
      </div>

      {/* Search drops to a second row once the bar is crowded. */}
      {isCrowded && hasDoc && (
        <div
          style={{
            height: 34,
            display: "flex",
            alignItems: "center",
            padding: "0 8px 6px 8px",
          }}
        >
          <form
            onSubmit={handleSearchSubmit}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              position: "relative",
            }}
          >
            <Search
              size={14}
              strokeWidth={1.5}
              style={{
                position: "absolute",
                left: 10,
                color: "var(--c-text-subtle)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder={t("nav.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: 26,
                backgroundColor: "var(--c-surface-sunken)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "0 28px 0 32px",
                fontSize: 12,
                color: "var(--c-text)",
                outline: "none",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  color: "var(--c-text-subtle)",
                  padding: 2,
                }}
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
          </form>
        </div>
      )}

      {/* Contextual tool strip for the active workspace. */}
      {hasDoc && (
        <div
          className="workbench-toolstrip"
          style={{
            height: 32,
            backgroundColor: "var(--c-bg-varied-1)",
            boxShadow: "var(--shadow-divider-b)",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            gap: 6,
            overflowX: "auto",
          }}
        >
          {currentView === "viewer" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <ActionBtn
                  title="Select mode (V)"
                  active={tool === "select"}
                  icon={<MousePointer2 size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("select")}
                />
                <ActionBtn
                  title="Hand pan mode (H)"
                  active={tool === "hand"}
                  icon={<Hand size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("hand")}
                />
                <ActionBtn
                  title="Edit existing text (click a word)"
                  active={tool === "text-edit"}
                  icon={<Type size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("text-edit")}
                />
                <ActionBtn
                  title="Add new text (click blank area)"
                  active={tool === "text-add"}
                  icon={<Type size={15} strokeWidth={1.85} style={{ opacity: 0.6 }} />}
                  onClick={() => toggleTool("text-add")}
                />
                <ActionBtn
                  title="Edit image"
                  active={tool === "image-edit"}
                  icon={<ImageIcon size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("image-edit")}
                />
                <ActionBtn
                  title="Insert an image (PNG / JPEG) onto this page"
                  icon={<ImagePlus size={15} strokeWidth={1.85} />}
                  onClick={pickImageToInsert}
                />
              </div>

              <div
                style={{
                  width: 1,
                  height: 14,
                  backgroundColor: "var(--c-border-subtle)",
                  margin: "0 4px",
                }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <ActionBtn
                  title="Text input field"
                  active={tool === "form-text"}
                  icon={<FormInput size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("form-text")}
                />
              </div>

              <div
                style={{
                  width: 1,
                  height: 14,
                  backgroundColor: "var(--c-border-subtle)",
                  margin: "0 4px",
                }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <ActionBtn
                  title="Text Highlight tool"
                  active={tool === "highlight"}
                  icon={<Highlighter size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("highlight")}
                />
                <ActionBtn
                  title="Text Underline tool"
                  active={tool === "underline"}
                  icon={<Underline size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("underline")}
                />
                <ActionBtn
                  title="Text Strikethrough tool"
                  active={tool === "strikethrough"}
                  icon={<Strikethrough size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("strikethrough")}
                />
                <ActionBtn
                  title="Sticky Note Review comment"
                  active={tool === "sticky-note"}
                  icon={<StickyNote size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("sticky-note")}
                />
                <ActionBtn
                  title="Freehand Ink Drawing"
                  active={tool === "draw"}
                  icon={<PenTool size={15} strokeWidth={1.85} />}
                  onClick={() => toggleTool("draw")}
                />
              </div>

              <TextStyleControls />

              <MarkupColorControls />

              <DrawColorControls />

              <ActionBtn
                title="Recognise text on this page with Tesseract (adds a selectable OCR layer)"
                icon={<ScanText size={15} strokeWidth={1.85} />}
                label="OCR page"
                onClick={() => onPageAction?.("ocr-page")}
              />

              <OcrLanguageSelector compact />

              <div
                style={{
                  width: 1,
                  height: 14,
                  backgroundColor: "var(--c-border-subtle)",
                  margin: "0 4px",
                }}
              />

              <ActionBtn
                title="Redact areas — drag boxes over sensitive content"
                active={tool === "redact-box"}
                icon={<ShieldAlert size={15} strokeWidth={1.85} />}
                label={redactions.length ? `Redact (${redactions.length})` : "Redact"}
                onClick={() => toggleTool("redact-box")}
              />

              {tool === "redact-box" && (
                <>
                  <ActionBtn
                    title="Burn the marked areas into the page"
                    danger
                    label="Apply redactions"
                    disabled={!redactions.length}
                    icon={<ShieldAlert size={15} strokeWidth={1.85} />}
                    onClick={() => onPageAction?.("apply-redactions")}
                  />
                  <ActionBtn
                    title="Clear marked redaction areas"
                    label="Clear"
                    disabled={!redactions.length}
                    icon={<X size={15} strokeWidth={1.85} />}
                    onClick={() => onPageAction?.("clear-redactions")}
                  />
                </>
              )}

              <div
                style={{
                  width: 1,
                  height: 14,
                  backgroundColor: "var(--c-border-subtle)",
                  margin: "0 4px",
                }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <ActionBtn
                  title="Single page view"
                  active={viewMode === "single"}
                  icon={<Square size={15} strokeWidth={1.85} />}
                  onClick={() => setViewMode("single")}
                />
                <ActionBtn
                  title="Continuous scroll"
                  active={viewMode === "continuous"}
                  icon={<Rows3 size={15} strokeWidth={1.85} />}
                  onClick={() => setViewMode("continuous")}
                />
                <ActionBtn
                  title="Two-page spread"
                  active={viewMode === "spread"}
                  icon={<Columns2 size={15} strokeWidth={1.85} />}
                  onClick={() => setViewMode("spread")}
                />
                <ActionBtn
                  title="Presentation mode"
                  active={viewMode === "presentation"}
                  icon={<Presentation size={15} strokeWidth={1.85} />}
                  onClick={() => setViewMode("presentation")}
                />
                <ActionBtn
                  title="Text reflow"
                  active={viewMode === "reflow"}
                  icon={<AlignLeft size={15} strokeWidth={1.85} />}
                  onClick={() => setViewMode(viewMode === "reflow" ? "continuous" : "reflow")}
                />
              </div>

              <div
                style={{
                  width: 1,
                  height: 14,
                  backgroundColor: "var(--c-border-subtle)",
                  margin: "0 4px",
                }}
              />

              <ActionBtn
                title="Browse every document tool"
                icon={<Wrench size={15} strokeWidth={1.85} />}
                label={t("toolbar.allTools")}
                onClick={() => setCurrentView("fileEditor")}
              />
            </>
          )}

          {currentView === "pageEditor" && (
            <>
              <ActionBtn
                title="Rotate Left 90°"
                icon={<RotateCcw size={15} strokeWidth={1.85} />}
                label="Rotate Left"
                onClick={() => onPageAction?.("rotate-left")}
              />
              <ActionBtn
                title="Rotate Right 90°"
                icon={<RotateCw size={15} strokeWidth={1.85} />}
                label="Rotate Right"
                onClick={() => onPageAction?.("rotate-right")}
              />
              <ActionBtn
                title="Insert Blank Page"
                icon={<Plus size={15} strokeWidth={1.85} />}
                label="Insert Page"
                onClick={() => onPageAction?.("insert")}
              />
              <ActionBtn
                title="Merge PDFs"
                icon={<LayoutGrid size={15} strokeWidth={1.85} />}
                label="Merge PDF"
                onClick={() => onPageAction?.("merge")}
              />
              <ActionBtn
                title="Extract Page"
                icon={<FileOutput size={15} strokeWidth={1.85} />}
                label="Extract"
                onClick={() => onPageAction?.("extract")}
              />
              <ActionBtn
                title="Delete Page"
                danger
                icon={<Trash2 size={15} strokeWidth={1.85} />}
                label="Delete"
                onClick={() => onPageAction?.("delete")}
              />
            </>
          )}

          {currentView === "fileEditor" && (
            <>
              <ActionBtn
                title="Convert & Export"
                icon={<FileOutput size={15} strokeWidth={1.85} />}
                label="Convert to Office / Image"
                onClick={() => setActiveDialog("convert")}
              />
              <ActionBtn
                title="Make Searchable (OCR)"
                icon={<ScanText size={15} strokeWidth={1.85} />}
                label="Run OCR"
                onClick={() => onPageAction?.("ocr")}
              />
              <OcrLanguageSelector />
              <ActionBtn
                title="Bates Numbering"
                icon={<Stamp size={15} strokeWidth={1.85} />}
                label="Bates Stamp"
                onClick={() => setActiveDialog("bates")}
              />
              <ActionBtn
                title="Detect Form Fields"
                icon={<FormInput size={15} strokeWidth={1.85} />}
                label="Auto-Detect Forms"
                onClick={() => onPageAction?.("auto-detect")}
              />
            </>
          )}
        </div>
      )}
      {showSearch && searchQuery.trim().length >= 2 && (
        <div
          className="search-popover"
          style={{
            position: "absolute",
            top: "100%",
            right: 16,
            width: 360,
            maxHeight: 360,
            overflow: "auto",
            padding: 10,
            borderRadius: "var(--radius-input)",
            border: "1px solid var(--border)",
            backgroundColor: "var(--c-surface)",
            boxShadow: "var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.22))",
            zIndex: 60,
            userSelect: "text",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <SearchOption
              active={searchOptions.caseSensitive}
              label="Aa"
              title="Match case"
              onClick={() => setSearchOptions((prev) => ({ ...prev, caseSensitive: !prev.caseSensitive }))}
            />
            <SearchOption
              active={searchOptions.wholeWord}
              label="W"
              title="Whole word"
              onClick={() => setSearchOptions((prev) => ({ ...prev, wholeWord: !prev.wholeWord }))}
            />
            <SearchOption
              active={searchOptions.diacritics}
              label="é"
              title="Match accents"
              onClick={() => setSearchOptions((prev) => ({ ...prev, diacritics: !prev.diacritics }))}
            />
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--c-text-muted)" }}>
              {searching ? "Searching…" : `${searchHits.length} result(s)`}
            </span>
            <button
              type="button"
              onClick={() => setShowSearch(false)}
              title="Close search results"
              style={{ border: 0, background: "transparent", color: "var(--c-text-muted)", cursor: "pointer" }}
            >
              <X size={14} />
            </button>
          </div>

          {searchError && (
            <div style={{ fontSize: 11.5, color: "var(--danger)", padding: "4px 2px" }}>{searchError}</div>
          )}
          {!searching && !searchError && searchHits.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--c-text-muted)", padding: "4px 2px" }}>
              No matches
            </div>
          )}

          {searchHits.slice(0, 30).map((hit, index) => (
            <button
              key={`${hit.pageIndex}-${hit.matchIndex}-${index}`}
              type="button"
              onClick={() => jumpToHit(hit)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: 0,
                borderTop: "1px solid var(--border-subtle)",
                background: "transparent",
                padding: "7px 4px",
                cursor: "pointer",
                color: "var(--c-text)",
                fontSize: 11.5,
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: "var(--c-text-subtle)", fontFamily: "var(--font-mono)" }}>
                p{hit.pageIndex + 1}
              </span>{" "}
              {hit.before}
              <mark style={{ background: "rgba(255, 214, 0, 0.35)", color: "inherit" }}>{hit.match}</mark>
              {hit.after}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

function SearchOption({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      style={{
        minWidth: 26,
        height: 24,
        padding: "0 6px",
        borderRadius: 6,
        border: `1px solid ${active ? "var(--c-brand)" : "var(--border-subtle)"}`,
        backgroundColor: active ? "var(--c-brand-subtle)" : "transparent",
        color: active ? "var(--c-brand)" : "var(--c-text-muted)",
        fontSize: 11.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

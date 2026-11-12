"use client";

import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/editor-store";
import { pickImageToInsert } from "@/lib/edit/insert-image";
import {
  BookOpen,
  LayoutGrid,
  Wrench,
  Search,
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
  const searchQuery = useEditorStore((s) => s.searchQuery);
  const setSearchQuery = useEditorStore((s) => s.setSearchQuery);
  const pageCount = useEditorStore((s) => s.pageCount);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const setActiveDialog = useEditorStore((s) => s.setActiveDialog);

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

    useEditorStore.getState().setStatus(`Searching for: "${query}"`);
  };

  return (
    <header
      ref={containerRef}
      style={{
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
        style={{
          height: "var(--bar-h)",
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
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
            <span>Viewer</span>
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
            <span>Organize</span>
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
            <span>Tools</span>
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
              placeholder="Search document text or #page..."
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

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {hasDoc && fileName && (
            <div
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
                title="Zoom out"
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
                title="Zoom in"
                icon={<ZoomIn size={15} strokeWidth={1.85} />}
                onClick={() => setZoom(Math.min(4, Number((zoom + 0.1).toFixed(2))))}
              />
              <ActionBtn
                title="Fit to width"
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
              <button
                type="button"
                title={dirty ? "Save changes (modified)" : "Save"}
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
                title="Export / Download"
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
                title="Close document"
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
              marginLeft: 2,
            }}
          >
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
              placeholder="Search document text or #page..."
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

              <MarkupColorControls />

              <ActionBtn
                title="Recognise text on this page with Tesseract (adds a selectable OCR layer)"
                icon={<ScanText size={15} strokeWidth={1.85} />}
                label="OCR page"
                onClick={() => onPageAction?.("ocr-page")}
              />

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
                label="All tools"
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
    </header>
  );
}

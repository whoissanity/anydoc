"use client";

import { useEditorStore } from "@/store/editor-store";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function StatusBar() {
  const currentPage = useEditorStore((s) => s.currentPage);
  const pageCount = useEditorStore((s) => s.pageCount);
  const zoom = useEditorStore((s) => s.zoom);
  const viewMode = useEditorStore((s) => s.viewMode);
  const statusMessage = useEditorStore((s) => s.statusMessage);
  const dirty = useEditorStore((s) => s.dirty);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);

  return (
    <footer
      style={{
        height: "var(--statusbar-h)",
        backgroundColor: "var(--c-surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        boxShadow: "var(--shadow-divider-t)",
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        fontSize: 12,
        color: "var(--c-text-muted)",
        gap: 16,
        userSelect: "none",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: dirty ? "var(--warning)" : "var(--success)",
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text)" }}>
          {dirty ? "Modified" : "Ready"}
        </span>
      </div>

      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "var(--c-text-muted)",
          fontSize: 12,
        }}
      >
        {statusMessage}
      </span>

      {hasDoc && (
        <>
          <span
            style={{
              textTransform: "capitalize",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--c-text-subtle)",
            }}
          >
            {viewMode}
          </span>

          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--c-text)",
            }}
          >
            {Math.round(zoom * 100)}%
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              title="Previous page"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              style={{
                width: 22,
                height: 22,
                borderRadius: "var(--radius-btn)",
                backgroundColor: "var(--c-surface-raised)",
                boxShadow: "var(--shadow-raised-sm)",
                color: currentPage <= 1 ? "var(--c-icon-disabled)" : "var(--c-icon-idle)",
                display: "grid",
                placeItems: "center",
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              <ChevronLeft size={13} strokeWidth={2} />
            </button>

            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <input
                type="number"
                min={1}
                max={pageCount || 1}
                value={currentPage}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 1 && v <= pageCount) setCurrentPage(v);
                }}
                style={{
                  width: 36,
                  height: 20,
                  backgroundColor: "var(--c-surface-sunken)",
                  border: "none",
                  borderRadius: 4,
                  textAlign: "center",
                  color: "var(--c-text)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  padding: 0,
                  outline: "none",
                }}
              />
              <span style={{ color: "var(--c-text-subtle)" }}>/ {pageCount || 0}</span>
            </span>

            <button
              type="button"
              title="Next page"
              disabled={currentPage >= pageCount}
              onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
              style={{
                width: 22,
                height: 22,
                borderRadius: "var(--radius-btn)",
                backgroundColor: "var(--c-surface-raised)",
                boxShadow: "var(--shadow-raised-sm)",
                color: currentPage >= pageCount ? "var(--c-icon-disabled)" : "var(--c-icon-idle)",
                display: "grid",
                placeItems: "center",
                cursor: currentPage >= pageCount ? "not-allowed" : "pointer",
              }}
            >
              <ChevronRight size={13} strokeWidth={2} />
            </button>
          </div>
        </>
      )}
    </footer>
  );
}

"use client";

import { useEditorStore } from "@/store/editor-store";
import {
  BookOpen,
  LayoutGrid,
  Wrench,
  PanelLeft,
  SlidersHorizontal,
  Bookmark,
  Paperclip,
  Layers,
  FolderOpen,
  Sun,
  Moon,
  MessageSquare,
} from "lucide-react";
import type { LeftPane } from "@/lib/types";
import { useI18n } from "@/components/providers/I18nProvider";

interface RailButtonProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  badge?: number | string;
}

function RailButton({
  label,
  icon,
  active,
  disabled,
  onClick,
  badge,
}: RailButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{
        position: "relative",
        width: 40,
        height: 40,
        borderRadius: "var(--radius-soft)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: active
          ? "var(--c-icon-active)"
          : disabled
          ? "var(--c-icon-disabled)"
          : "var(--c-icon-idle)",
        backgroundColor: active
          ? "var(--c-surface-elevated)"
          : "transparent",
        boxShadow: active ? "var(--shadow-raised)" : "none",
        border: active ? "1px solid var(--c-border-strong)" : "1px solid transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 140ms ease",
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.color = "var(--c-icon-hover)";
          e.currentTarget.style.backgroundColor = "var(--c-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.color = "var(--c-icon-idle)";
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {icon}
      {badge !== undefined && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 14,
            height: 14,
            borderRadius: "var(--radius-btn)",
            backgroundColor: "var(--c-btn-bg)",
            color: "var(--c-btn-text)",
            fontSize: 9,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export function Rail({ onOpenFile }: { onOpenFile?: () => void }) {
  const { t } = useI18n();
  const currentView = useEditorStore((s) => s.currentView);
  const setCurrentView = useEditorStore((s) => s.setCurrentView);
  const leftPane = useEditorStore((s) => s.leftPane);
  const setLeftPane = useEditorStore((s) => s.setLeftPane);
  const showInspector = useEditorStore((s) => s.showInspector);
  const setShowInspector = useEditorStore((s) => s.setShowInspector);
  const pageCount = useEditorStore((s) => s.pageCount);
  const comments = useEditorStore((s) => s.comments);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);
  const theme = useEditorStore((s) => s.theme);
  const toggleTheme = useEditorStore((s) => s.toggleTheme);

  const togglePane = (pane: LeftPane) => {
    if (leftPane === pane) {
      setLeftPane("none");
    } else {
      setLeftPane(pane);
    }
  };

  return (
    <nav
      className="editor-rail"
      aria-label={t("rail.nav")}
      style={{
        width: "var(--rail-w)",
        backgroundColor: "var(--c-surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        boxShadow: "var(--shadow-divider-r)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        gap: 6,
        flexShrink: 0,
        zIndex: 40,
        userSelect: "none",
      }}
    >
      <RailButton
        label={t("nav.openDocument")}
        icon={<FolderOpen size={20} strokeWidth={1.85} />}
        onClick={() => {
          if (onOpenFile) {
            onOpenFile();
          } else {
            const el = document.getElementById("anydoc-file-input");
            el?.click();
          }
        }}
      />

      <div
        style={{
          width: 24,
          height: 1,
          backgroundColor: "var(--c-border-subtle)",
          margin: "4px 0",
        }}
      />

      <RailButton
        label={t("rail.viewer")}
        icon={<BookOpen size={20} strokeWidth={1.85} />}
        active={currentView === "viewer"}
        disabled={!hasDoc}
        onClick={() => setCurrentView("viewer")}
      />
      <RailButton
        label={t("rail.organize")}
        icon={<LayoutGrid size={20} strokeWidth={1.85} />}
        active={currentView === "pageEditor"}
        disabled={!hasDoc}
        badge={pageCount > 0 ? pageCount : undefined}
        onClick={() => setCurrentView("pageEditor")}
      />
      <RailButton
        label={t("rail.tools")}
        icon={<Wrench size={20} strokeWidth={1.85} />}
        active={currentView === "fileEditor"}
        disabled={!hasDoc}
        onClick={() => setCurrentView("fileEditor")}
      />

      <div
        style={{
          width: 24,
          height: 1,
          backgroundColor: "var(--c-border-subtle)",
          margin: "4px 0",
        }}
      />

      <RailButton
        label={t("pane.thumbnails")}
        icon={<PanelLeft size={20} strokeWidth={1.85} />}
        active={leftPane === "thumbnails" && currentView === "viewer"}
        disabled={!hasDoc || currentView !== "viewer"}
        onClick={() => togglePane("thumbnails")}
      />
      <RailButton
        label={t("pane.outline")}
        icon={<Bookmark size={20} strokeWidth={1.85} />}
        active={leftPane === "outline" && currentView === "viewer"}
        disabled={!hasDoc || currentView !== "viewer"}
        onClick={() => togglePane("outline")}
      />
      <RailButton
        label={t("pane.attachments")}
        icon={<Paperclip size={20} strokeWidth={1.85} />}
        active={leftPane === "attachments" && currentView === "viewer"}
        disabled={!hasDoc || currentView !== "viewer"}
        onClick={() => togglePane("attachments")}
      />
      <RailButton
        label={t("pane.layers")}
        icon={<Layers size={20} strokeWidth={1.85} />}
        active={leftPane === "layers" && currentView === "viewer"}
        disabled={!hasDoc || currentView !== "viewer"}
        onClick={() => togglePane("layers")}
      />
      <RailButton
        label={t("pane.comments")}
        icon={<MessageSquare size={20} strokeWidth={1.85} />}
        active={leftPane === "comments" && currentView === "viewer"}
        disabled={!hasDoc || currentView !== "viewer"}
        badge={comments.length > 0 ? comments.length : undefined}
        onClick={() => togglePane("comments")}
      />

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        <RailButton
          label={theme === "dark" ? t("rail.themeLight") : t("rail.themeDark")}
          icon={
            theme === "dark" ? (
              <Sun size={20} strokeWidth={1.85} style={{ color: "var(--c-accent-orange)" }} />
            ) : (
              <Moon size={20} strokeWidth={1.85} />
            )
          }
          onClick={toggleTheme}
        />
        <RailButton
          label={t("rail.inspector")}
          icon={<SlidersHorizontal size={20} strokeWidth={1.85} />}
          active={showInspector}
          disabled={!hasDoc}
          onClick={() => setShowInspector(!showInspector)}
        />
      </div>
    </nav>
  );
}

"use client";

import {
  AlignLeft,
  BookOpen,
  FolderOpen,
  LayoutGrid,
  PanelLeft,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEditorStore } from "@/store/editor-store";
import { useI18n } from "@/components/providers/I18nProvider";

interface MobileNavButtonProps {
  label: string;
  ariaLabel?: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function MobileNavButton({
  label,
  ariaLabel,
  icon,
  active,
  disabled,
  onClick,
}: MobileNavButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      title={ariaLabel ?? label}
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 44,
        height: 44,
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: 0,
        border: "none",
        borderRadius: "var(--radius-soft)",
        backgroundColor: active ? "var(--c-surface-elevated)" : "transparent",
        color: active
          ? "var(--c-icon-active)"
          : disabled
          ? "var(--c-icon-disabled)"
          : "var(--c-icon-idle)",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.01em",
        cursor: disabled ? "not-allowed" : "pointer",
        touchAction: "manipulation",
      }}
    >
      {icon}
      <span
        style={{
          lineHeight: 1,
          whiteSpace: "nowrap",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
    </button>
  );
}

/** Phone-only bottom bar. The desktop rail stays in place at >= 701px. */
export function MobileNav({ onOpenFile }: { onOpenFile?: () => void }) {
  const { t } = useI18n();
  const currentView = useEditorStore((s) => s.currentView);
  const setCurrentView = useEditorStore((s) => s.setCurrentView);
  const leftPane = useEditorStore((s) => s.leftPane);
  const setLeftPane = useEditorStore((s) => s.setLeftPane);
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);
  const paneOpen = leftPane !== "none";
  const reflow = viewMode === "reflow";

  const openFile = () => {
    if (onOpenFile) {
      onOpenFile();
    } else {
      document.getElementById("anydoc-file-input")?.click();
    }
  };

  return (
    <nav className="mobile-nav" aria-label="Document navigation">
      <MobileNavButton
        label="Open"
        ariaLabel={t("nav.openDocument")}
        icon={<FolderOpen size={19} strokeWidth={1.85} />}
        onClick={openFile}
      />
      <MobileNavButton
        label={t("toolbar.viewer")}
        icon={<BookOpen size={19} strokeWidth={1.85} />}
        active={currentView === "viewer" && !reflow}
        disabled={!hasDoc}
        onClick={() => {
          setCurrentView("viewer");
          setViewMode("continuous");
          setLeftPane("none");
        }}
      />
      <MobileNavButton
        label={t("toolbar.organize")}
        icon={<LayoutGrid size={19} strokeWidth={1.85} />}
        active={currentView === "pageEditor"}
        disabled={!hasDoc}
        onClick={() => {
          setCurrentView("pageEditor");
          setLeftPane("none");
        }}
      />
      <MobileNavButton
        label={t("toolbar.tools")}
        icon={<Wrench size={19} strokeWidth={1.85} />}
        active={currentView === "fileEditor"}
        disabled={!hasDoc}
        onClick={() => {
          setCurrentView("fileEditor");
          setLeftPane("none");
        }}
      />
      <MobileNavButton
        label="Pages"
        ariaLabel={t("pane.thumbnails")}
        icon={<PanelLeft size={19} strokeWidth={1.85} />}
        active={paneOpen}
        disabled={!hasDoc || currentView !== "viewer"}
        onClick={() => {
          if (paneOpen) {
            setLeftPane("none");
          } else {
            setCurrentView("viewer");
            setViewMode("continuous");
            setLeftPane("thumbnails");
          }
        }}
      />
      <MobileNavButton
        label="Read"
        icon={<AlignLeft size={19} strokeWidth={1.85} />}
        active={reflow}
        disabled={!hasDoc}
        onClick={() => {
          setCurrentView("viewer");
          setViewMode(reflow ? "continuous" : "reflow");
          setLeftPane("none");
        }}
      />
    </nav>
  );
}
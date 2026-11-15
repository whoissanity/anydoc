"use client";

import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { clearDraft } from "@/lib/storage/draft-store";
import { useEditorStore } from "@/store/editor-store";

interface Props {
  children: ReactNode;
  /** Changing this (view or document) clears a stale crash instead of trapping the user. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Boundary around the canvas/editor subtree. A malformed page or a PDF.js throw
 * replaces only this region — the toolbar, rail and status bar stay usable, and
 * the document can be closed instead of white-screening the whole workbench.
 */
export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Local console only: no telemetry, no upload (AGENTS.md privacy rules).
    console.error("Editor view crashed", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  private closeDocument = async () => {
    await clearDraft();
    useEditorStore.getState().resetDocument();
    this.reset();
  };

  render() {
    const error = this.state.error;
    if (!error) return this.props.children;
    return <EditorCrash error={error} onReset={this.reset} onClose={this.closeDocument} />;
  }
}

function EditorCrash({
  error,
  onReset,
  onClose,
}: {
  error: Error;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        padding: 24,
        backgroundColor: "var(--c-bg)",
        color: "var(--c-text)",
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          padding: "22px 24px",
          borderRadius: "var(--radius-card)",
          backgroundColor: "var(--c-surface-raised)",
          border: "1px solid var(--c-border-subtle)",
          boxShadow: "var(--shadow-raised-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <strong style={{ fontSize: 15 }}>{t("editor.errorTitle")}</strong>
        <span style={{ fontSize: 12, lineHeight: 1.55, color: "var(--c-text-muted)" }}>
          {t("editor.errorBody")}
        </span>
        <pre
          style={{
            margin: 0,
            maxHeight: 160,
            overflow: "auto",
            padding: 10,
            borderRadius: "var(--radius-btn)",
            backgroundColor: "var(--c-surface-sunken)",
            color: "var(--c-text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message || String(error)}
        </pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onReset} style={primaryButton}>
            {t("editor.tryAgain")}
          </button>
          <button type="button" onClick={() => void onClose()} style={secondaryButton}>
            {t("editor.closeDocument")}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={secondaryButton}
          >
            {t("editor.reloadApp")}
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryButton: CSSProperties = {
  padding: "7px 12px",
  borderRadius: "var(--radius-btn)",
  border: "1px solid var(--c-primary)",
  backgroundColor: "var(--c-primary)",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: CSSProperties = {
  padding: "7px 12px",
  borderRadius: "var(--radius-btn)",
  border: "1px solid var(--c-border-strong)",
  backgroundColor: "var(--c-surface)",
  color: "var(--c-text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
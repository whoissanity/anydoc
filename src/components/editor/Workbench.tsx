"use client";

import { lazy, Suspense, useEffect } from "react";
import { useEditorStore } from "@/store/editor-store";
import { Rail } from "@/components/shared/Rail";
import { MobileNav } from "@/components/shared/MobileNav";
import { WorkbenchBar } from "@/components/shared/WorkbenchBar";
import { useIsCompact, useMediaQuery } from "@/lib/use-media-query";
import { EditorErrorBoundary } from "@/components/editor/EditorErrorBoundary";
import { StatusBar } from "./StatusBar";
import LandingWorkspace from "@/components/workspaces/LandingWorkspace";

// R2: Lazy-loaded workspaces to keep initial bundle small
const ViewerWorkspace = lazy(() => import("@/components/workspaces/ViewerWorkspace"));
const PageEditorWorkspace = lazy(
  () => import("@/components/workspaces/PageEditorWorkspace")
);
const FileEditorWorkspace = lazy(
  () => import("@/components/workspaces/FileEditorWorkspace")
);

function WorkspaceFallback() {
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        backgroundColor: "var(--c-bg)",
        color: "var(--c-text-muted)",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 14,
            height: 14,
            border: "2px solid var(--c-border-subtle)",
            borderTopColor: "var(--c-primary)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span>Loading workspace…</span>
      </div>
    </div>
  );
}

export function Workbench({
  onOpenFile,
  onSave,
  onDownload,
  onCloseDocument,
  onPageAction,
  onExport,
  onCreate,
  onOcr,
  onAutoDetect,
}: {
  onOpenFile: () => void;
  onSave: () => void;
  onDownload: () => void;
  onCloseDocument: () => void;
  onPageAction: (action: string) => void;
  onExport: (format: string) => void;
  onCreate: (kind: string) => void;
  onOcr: () => void;
  onAutoDetect: () => void;
}) {
  const currentView = useEditorStore((s) => s.currentView);
  const pageCount = useEditorStore((s) => s.pageCount);
  const showWelcome = useEditorStore((s) => s.showWelcome);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);
  const leftPane = useEditorStore((s) => s.leftPane);
  const setLeftPane = useEditorStore((s) => s.setLeftPane);
  const setShowInspector = useEditorStore((s) => s.setShowInspector);
  const isCompact = useIsCompact();
  const isOverlay = useMediaQuery("(max-width: 900px)");

  // On overlay layouts the thumbnail pane would cover the document on open. The pane
  // can still be opened from the rail/bottom bar; this only runs when the shell changes.
  useEffect(() => {
    if (!isOverlay) return;
    setLeftPane("none");
    setShowInspector(false);
  }, [isOverlay, setLeftPane, setShowInspector]);

  return (
    <div
      className="editor-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--c-bg)",
        overflow: "hidden",
      }}
    >
      <WorkbenchBar
        onSave={onSave}
        onDownload={onDownload}
        onCloseDocument={onCloseDocument}
        onPageAction={onPageAction}
      />

      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {isCompact ? <MobileNav onOpenFile={onOpenFile} /> : <Rail onOpenFile={onOpenFile} />}

        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {showWelcome || !hasDoc ? (
            <LandingWorkspace onOpenFile={onOpenFile} onCreate={onCreate} />
          ) : (
            <EditorErrorBoundary resetKey={`${currentView}-${pageCount}`}>
              <Suspense fallback={<WorkspaceFallback />}>
                {currentView === "viewer" && <ViewerWorkspace />}
                {currentView === "pageEditor" && <PageEditorWorkspace />}
                {currentView === "fileEditor" && (
                  <FileEditorWorkspace
                    onExport={onExport}
                    onCreate={onCreate}
                    onOcr={onOcr}
                    onAutoDetect={onAutoDetect}
                  />
                )}
              </Suspense>
            </EditorErrorBoundary>
          )}
        </main>
      </div>

      {isOverlay && leftPane !== "none" && (
        <button
          type="button"
          className="mobile-pane-backdrop"
          aria-label="Close panel"
          onClick={() => setLeftPane("none")}
        />
      )}

      <div className="editor-statusbar">
        <StatusBar />
      </div>
    </div>
  );
}

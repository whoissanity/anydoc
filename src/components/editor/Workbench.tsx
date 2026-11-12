"use client";

import { lazy, Suspense } from "react";
import { useEditorStore } from "@/store/editor-store";
import { Rail } from "@/components/shared/Rail";
import { WorkbenchBar } from "@/components/shared/WorkbenchBar";
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
  const showWelcome = useEditorStore((s) => s.showWelcome);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);

  return (
    <div
      style={{
        height: "100vh",
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
        <Rail onOpenFile={onOpenFile} />

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
          )}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}

"use client";

import { LeftPanes } from "@/components/panes/LeftPanes";
import { PdfViewer } from "@/components/viewer/PdfViewer";
import { Inspector } from "@/components/editor/Inspector";
import { useEditorStore } from "@/store/editor-store";

export default function ViewerWorkspace() {
  const leftPane = useEditorStore((s) => s.leftPane);
  const showInspector = useEditorStore((s) => s.showInspector);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {leftPane !== "none" && <LeftPanes />}
      <PdfViewer />
      {showInspector && <Inspector />}
    </div>
  );
}

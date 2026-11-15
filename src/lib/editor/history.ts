import { useEditorStore, type EditorHistoryEntry } from "@/store/editor-store";
import { reloadFromBytes } from "@/lib/document/document-service";

export interface OverlaySnapshot {
  annotations: EditorHistoryEntry["annotations"];
  stickyNotes: EditorHistoryEntry["stickyNotes"];
  comments: EditorHistoryEntry["comments"];
  formFields: EditorHistoryEntry["formFields"];
  ocrPages: EditorHistoryEntry["ocrPages"];
  images: EditorHistoryEntry["images"];
  redactions: EditorHistoryEntry["redactions"];
  textObjects: EditorHistoryEntry["textObjects"];
  imagesScanned: boolean;
  bates: EditorHistoryEntry["bates"];
}

/** Puts overlays back after a page-preserving reload; used by tools and page actions. */
export function restoreOverlays(snapshot: OverlaySnapshot): void {
  useEditorStore.setState({
    annotations: snapshot.annotations,
    stickyNotes: snapshot.stickyNotes,
    comments: snapshot.comments,
    formFields: snapshot.formFields,
    ocrPages: snapshot.ocrPages,
    images: snapshot.images,
    redactions: snapshot.redactions,
    textObjects: snapshot.textObjects,
    imagesScanned: snapshot.imagesScanned,
    bates: { ...snapshot.bates },
  });
  useEditorStore.getState().setDirty(true);
}

/** Drops overlays after they have been baked into the PDF bytes. */
export function clearOverlays(): void {
  useEditorStore.setState({
    annotations: [],
    stickyNotes: [],
    comments: [],
    formFields: [],
    ocrPages: [],
    images: [],
    redactions: [],
    textObjects: [],
    imagesScanned: true,
  });
  useEditorStore.getState().setBates({ enabled: false });
  useEditorStore.getState().setDirty(true);
}

async function restoreEntry(entry: EditorHistoryEntry): Promise<void> {
  await reloadFromBytes(entry.bytes, entry.fileName ?? undefined);
  const state = useEditorStore.getState();
  state.setCurrentPage(Math.min(Math.max(1, entry.currentPage), Math.max(1, state.pageCount)));
  state.setZoom(entry.zoom);
  state.setZoomMode(entry.zoomMode);
  state.setViewMode(entry.viewMode);
  restoreOverlays(entry);
  state.setDirty(entry.dirty);
  state.setStatus(`Undid ${entry.label}`);
}

export async function undo(): Promise<boolean> {
  const state = useEditorStore.getState();
  if (state.historyIndex <= 0) return false;
  const entry = state.history[state.historyIndex - 1];
  if (!entry) return false;
  await restoreEntry(entry);
  useEditorStore.setState({ historyIndex: state.historyIndex - 1 });
  return true;
}

export async function redo(): Promise<boolean> {
  const state = useEditorStore.getState();
  if (state.historyIndex >= state.history.length - 1) return false;
  const entry = state.history[state.historyIndex + 1];
  if (!entry) return false;
  await restoreEntry(entry);
  useEditorStore.setState({ historyIndex: state.historyIndex + 1 });
  return true;
}

export function historyStatus(): { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null } {
  const state = useEditorStore.getState();
  const undoEntry = state.history[state.historyIndex - 1];
  const redoEntry = state.history[state.historyIndex + 1];
  return {
    canUndo: Boolean(undoEntry),
    canRedo: Boolean(redoEntry),
    undoLabel: undoEntry?.label ?? null,
    redoLabel: redoEntry?.label ?? null,
  };
}
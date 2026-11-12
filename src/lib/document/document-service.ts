"use client";

import {
  extractAttachments,
  extractLayers,
  extractOutline,
  loadPdfDocument,
} from "@/lib/document/load";
import { useEditorStore } from "@/store/editor-store";
import { DEFAULT_EXPORT_SCOPE } from "@/lib/export/scope";
import { assertPdfBytes, readPdfFile } from "@/lib/document/validate";

export async function openPdfFile(file: File) {
  // Content check at the boundary: the extension and MIME type are not evidence.
  return openPdfBytes(await readPdfFile(file), file.name);
}

export async function openPdfBytes(
  bytes: Uint8Array,
  fileName: string,
  options: { preserveExportScope?: boolean } = {}
) {
  // Every load path (open, merge, insert, reload after an edit) passes here.
  assertPdfBytes(bytes);
  const copy = bytes.slice();
  const doc = await loadPdfDocument(copy);
  const outline = await extractOutline(doc as never);
  const attachments = await extractAttachments(doc as never);
  const layers = await extractLayers(doc as never);

  useEditorStore.getState().setPdf({
    fileName,
    bytes: bytes.slice(),
    pageCount: doc.numPages,
    proxy: doc,
  });
  // A range from the previous document would export the wrong pages, so drop it unless reloading the same doc.
  if (!options.preserveExportScope) {
    useEditorStore.getState().setExportScope({ ...DEFAULT_EXPORT_SCOPE });
  }
  useEditorStore.getState().setOutline(outline);
  useEditorStore.getState().setAttachments(attachments);
  useEditorStore.getState().setLayers(layers);
  return doc;
}

export async function reloadFromBytes(bytes: Uint8Array, fileName?: string) {
  const state = useEditorStore.getState();
  const name = fileName || state.fileName || "document.pdf";
  // Edits rewrite the same document, so the user's page scope must survive a reload.
  await openPdfBytes(bytes, name, { preserveExportScope: true });
  useEditorStore.getState().setDirty(true);
}

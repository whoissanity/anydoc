"use client";

import {
  extractAttachments,
  extractComments,
  extractLayers,
  extractOutline,
  loadPdfDocument,
} from "@/lib/document/load";
import { useEditorStore } from "@/store/editor-store";
import { DEFAULT_EXPORT_SCOPE } from "@/lib/export/scope";
import { assertPdfBytes, readPdfFile } from "@/lib/document/validate";
import { assertDocumentBudget } from "@/lib/document/budget";
import { PdfPasswordRequiredError } from "@/lib/document/load";
import { decryptPDF, isEncrypted } from "@localonlytools/pdf-decrypt";

async function preparePdfBytes(
  bytes: Uint8Array,
  password: string | undefined
): Promise<{ bytes: Uint8Array; decrypted: boolean }> {
  let info: Awaited<ReturnType<typeof isEncrypted>>;
  try {
    info = await isEncrypted(bytes);
  } catch {
    // A parser failure is reported by the normal load path with a readable message.
    return { bytes, decrypted: false };
  }
  if (!info.encrypted) return { bytes, decrypted: false };

  // Some encrypted PDFs use an empty user password; try that before prompting.
  const candidates = password === undefined ? [""] : [password];
  for (const candidate of candidates) {
    try {
      return { bytes: await decryptPDF(bytes, candidate), decrypted: true };
    } catch {
      // Try the next candidate; the caller turns an exhausted list into a prompt.
    }
  }
  throw new PdfPasswordRequiredError(password === undefined ? 1 : 2);
}

export async function openPdfFile(
  file: File,
  options: { password?: string } = {}
) {
  // Content check at the boundary: the extension and MIME type are not evidence.
  return openPdfBytes(await readPdfFile(file), file.name, options);
}

export async function openPdfBytes(
  bytes: Uint8Array,
  fileName: string,
  options: {
    preserveExportScope?: boolean;
    preserveView?: boolean;
    password?: string;
    /** False for reloads of bytes this app already produced; skips a redundant parse. */
    checkEncryption?: boolean;
  } = {}
) {
  // Every load path (open, merge, insert, reload after an edit) passes here.
  assertPdfBytes(bytes);
  const prepared =
    options.checkEncryption === false
      ? { bytes, decrypted: false }
      : await preparePdfBytes(bytes, options.password);
  assertPdfBytes(prepared.bytes);
  const doc = await loadPdfDocument(prepared.bytes, { password: options.password });
  try {
    // Check after the proxy is open: numPages is only authoritative then.
    assertDocumentBudget(prepared.bytes.byteLength, doc.numPages);
  } catch (error) {
    // Release the worker before surfacing a budget error.
    const destroy = (doc as { destroy?: () => Promise<void> }).destroy;
    if (destroy) void destroy.call(doc).catch(() => undefined);
    throw error;
  }
  const outline = await extractOutline(doc as never);
  const attachments = await extractAttachments(doc as never);
  const layers = await extractLayers(doc as never);
  const previousComments = useEditorStore.getState().comments;
  const preserveView = options.preserveView === true;

  useEditorStore.getState().setPdf({
    fileName,
    bytes: prepared.bytes.slice(),
    pageCount: doc.numPages,
    proxy: doc,
    preserveView: options.preserveView,
    decrypted: prepared.decrypted,
  });
  // A range from the previous document would export the wrong pages, so drop it unless reloading the same doc.
  if (!options.preserveExportScope) {
    useEditorStore.getState().setExportScope({ ...DEFAULT_EXPORT_SCOPE });
  }
  useEditorStore.getState().setOutline(outline);
  useEditorStore.getState().setAttachments(attachments);
  useEditorStore.getState().setLayers(layers);

  const proxyWithContent = doc as {
    getOptionalContentConfig?: () => Promise<unknown>;
  };
  if (typeof proxyWithContent.getOptionalContentConfig === "function") {
    try {
      const config = await proxyWithContent.getOptionalContentConfig();
      useEditorStore.getState().setOptionalContentConfig(config);
    } catch {
      useEditorStore.getState().setOptionalContentConfig(null);
    }
  }

  // Comments live in PDF text notes. A structural reload (a tool run) keeps the
  // current threads rather than paying for a full annotation scan on every edit.
  if (preserveView) {
    useEditorStore.setState({ comments: previousComments });
  } else {
    try {
      useEditorStore.setState({ comments: await extractComments(doc as never) });
    } catch {
      useEditorStore.setState({ comments: [] });
    }
  }

  return doc;
}

export async function reloadFromBytes(bytes: Uint8Array, fileName?: string) {
  const state = useEditorStore.getState();
  const name = fileName || state.fileName || "document.pdf";
  // Edits rewrite the same document, so keep the page, zoom and scroll the user is working
  // at instead of re-framing the document (and briefly blanking the page) on every commit.
  await openPdfBytes(bytes, name, {
    preserveExportScope: true,
    preserveView: true,
    checkEncryption: false,
  });
  useEditorStore.getState().setDirty(true);
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Workbench } from "./Workbench";
import {
  BatesDialog,
  ConvertDialog,
  CreateTextDialog,
  RedactionDialog,
  DigitalSignatureDialog,
  MetadataScrubDialog,
  PasswordDialog,
  OpenPasswordDialog,
} from "./Dialogs";
import { OcrPacksDialog } from "./OcrPacksDialog";
import { ToolDialog } from "@/components/tools/ToolDialog";
import { BatchDialog } from "@/components/tools/BatchDialog";
import { PdfAPrepDialog } from "@/components/dialogs/PdfAPrepDialog";
import { OcrProgressModal } from "@/components/dialogs/OcrProgressModal";
import {
  documentFingerprint,
  stampDigitalSignature,
  scrubPdfMetadata,
  exportCommentsToFdf,
} from "@/lib/security/pdf-security";
import { redactPdf } from "@/lib/document/optimize";
import { imageNeedsBake } from "@/lib/edit/edit-engine";
import { bakePendingEdits } from "@/lib/edit/bake";
import { useEditorStore } from "@/store/editor-store";
import { openPdfBytes, reloadFromBytes } from "@/lib/document/document-service";
import { clearOverlays, redo, restoreOverlays, undo } from "@/lib/editor/history";
import { downloadBlob, PdfPasswordRequiredError } from "@/lib/document/load";
import { readImageFile, readPdfFile } from "@/lib/document/validate";
import { extractPlacedImages } from "@/lib/edit/image-objects";
import { classifyImportFile, importedPdfName } from "@/lib/document/import-routing";
import {
  applyBatesNumbering,
  createPdfFromImages,
  createPdfFromText,
  deletePages,
  extractPages,
  insertBlankPage,
  insertPagesFromFile,
  mergePdfs,
  splitPdf,
  rotatePage,
} from "@/lib/document/pages";
import { autoDetectFieldsFromCanvas } from "@/lib/edit/forms";
import {
  createPdfFromHtml,
  createPdfFromOffice,
  renderPagesToBlobs,
} from "@/lib/document/convert-client";
import { exportDocument } from "@/lib/export";
import { ocrTextForExport } from "@/lib/export/ocr-text";
import {
  addScopeToFilename,
  isWholeDocument,
  resolveExportScope,
  scopeFileSuffix,
} from "@/lib/export/scope";
import { OCR_DPI, runOcrPipeline } from "@/lib/pdf/ocr-manager";
import type { OcrProgressUpdate } from "@/lib/pdf/ocr-protocol";
import {
  clearDraft,
  getAutosaveNoticeShown,
  installBeforeUnloadWarning,
  isDraftEncryptionEnabled,
  readDraftRecord,
  setAutosaveEnabled,
  setAutosaveNoticeShown,
  startAutosave,
  unlockDraft,
  type DraftSaveFailureReason,
  type DraftSnapshot,
  type LockedDraftMeta,
} from "@/lib/storage/draft-store";
import { LocalDraftControls } from "@/components/shared/LocalDraftControls";
import { LocalFontsControls } from "@/components/shared/LocalFontsControls";
import { FontBoot } from "@/components/shared/FontBoot";
import { recognizeCanvas, renderPageForOcr } from "@/lib/ocr/service";
import { useI18n } from "@/components/providers/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { BatesOptions } from "@/lib/types";

function relativeDraftTime(
  savedAt: number,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  now = Date.now()
): string {
  const minutes = Math.max(0, Math.round((now - savedAt) / 60_000));
  if (minutes < 1) return t("draft.justNow");
  if (minutes < 60) return t("draft.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("draft.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  return t("draft.daysAgo", { count: days });
}

function autosaveProblemReason(reason: DraftSaveFailureReason): MessageKey {
  if (reason === "too-large") return "draft.reasonTooLarge";
  if (reason === "quota") return "draft.reasonQuota";
  if (reason === "locked") return "draft.reasonLocked";
  return "draft.reasonError";
}

export function EditorShell() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const insertInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const theme = useEditorStore((s) => s.theme);
  const tool = useEditorStore((s) => s.tool);
  const pdfBytes = useEditorStore((s) => s.pdfBytes);
  const currentFileName = useEditorStore((s) => s.fileName);
  const exportProgress = useEditorStore((s) => s.exportProgress);
  const activeDialog = useEditorStore((s) => s.activeDialog);
  const setActiveDialog = useEditorStore((s) => s.setActiveDialog);
  const [createKind, setCreateKind] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<DraftSnapshot | null>(null);
  const [lockedDraft, setLockedDraft] = useState<LockedDraftMeta | null>(null);
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [autosaveProblem, setAutosaveProblem] = useState<{
    reason: DraftSaveFailureReason;
    size: number;
  } | null>(null);
  const [autosaveEpoch, setAutosaveEpoch] = useState(0);
  const [showAutosaveNotice, setShowAutosaveNotice] = useState(false);
  const [draftEncrypted, setDraftEncrypted] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    bytes: Uint8Array;
    fileName: string;
    incorrect: boolean;
    draft?: DraftSnapshot;
  } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgressUpdate | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const ocrAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    void isDraftEncryptionEnabled().then(setDraftEncrypted);
  }, []);

  // Offer a recovered draft before the user opens anything. An encrypted draft
  // stays locked here: only its name and timestamp are readable.
  useEffect(() => {
    let cancelled = false;
    void readDraftRecord().then((record) => {
      if (cancelled || !record) return;
      if (record.kind === "plain") setRecoveredDraft(record.snapshot);
      else setLockedDraft(record.meta);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Local crash-recovery autosave + the standard unsaved-changes guard.
  useEffect(() => {
    const stopAutosave = startAutosave({
      onProblem: (problem) => setAutosaveProblem(problem),
      onSaved: () => {
        setAutosaveProblem(null);
        void (async () => {
          setDraftEncrypted(await isDraftEncryptionEnabled());
          if (await getAutosaveNoticeShown()) return;
          await setAutosaveNoticeShown(true);
          setShowAutosaveNotice(true);
        })();
      },
    });
    const removeUnloadWarning = installBeforeUnloadWarning();
    return () => {
      stopAutosave();
      removeUnloadWarning();
    };
  }, [autosaveEpoch]);

  // Image extraction queues behind the viewer's paint so the two pdf.js renders don't fight.
  useEffect(() => {
    if (tool !== "image-edit" && tool !== "select") return;
    const state = useEditorStore.getState();
    if (state.imagesScanned || !state.pdfBytes) return;
    void seedImages();
  }, [tool, pdfBytes]);

  const handleOpenFile = useCallback(async (file: File) => {
    const state = useEditorStore.getState();
    try {
      state.setStatus(`Opening ${file.name}…`);
      // Every picker and dropzone accepts any file; the bytes decide: PDFs open, the rest convert.
      const kind = await classifyImportFile(file);
      if (kind === "pdf") {
        const bytes = await readPdfFile(file);
        try {
          await openPdfBytes(bytes, file.name);
        } catch (error) {
          if (error instanceof PdfPasswordRequiredError) {
            setPasswordPrompt({
              bytes,
              fileName: file.name,
              incorrect: error.code === 2,
            });
            setPasswordError(
              error.code === 2 ? t("dialog.openPassword.incorrect") : null
            );
            return;
          }
          throw error;
        }
      } else if (kind === "image") {
        const next = await createPdfFromImages([await readImageFile(file)]);
        await openPdfBytes(next, importedPdfName(file.name));
      } else if (kind === "html") {
        const next = await createPdfFromHtml(await file.text());
        await openPdfBytes(next, importedPdfName(file.name));
      } else {
        const next = await createPdfFromOffice(file);
        await openPdfBytes(next, importedPdfName(file.name));
      }
      // Opening a new document replaces the previous draft and gives autosave a
      // fresh start: the new document may be under the size cap.
      await clearDraft();
      setAutosaveProblem(null);
      setAutosaveEpoch((value) => value + 1);
    } catch (e) {
      state.setStatus(e instanceof Error ? e.message : "Could not open that file");
    }
  }, [t]);

  const submitOpenPassword = useCallback(async (password: string) => {
    const prompt = passwordPrompt;
    if (!prompt || !password) return;
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await openPdfBytes(prompt.bytes, prompt.fileName, { password });
      if (prompt.draft) {
        useEditorStore.getState().hydrateFromDraft(prompt.draft);
        setRecoveredDraft(null);
      } else {
        await clearDraft();
        setAutosaveProblem(null);
        setAutosaveEpoch((value) => value + 1);
      }
      setPasswordPrompt(null);
      setPasswordBusy(false);
      useEditorStore.getState().setStatus(t("status.decryptedNoDraft"));
    } catch (error) {
      setPasswordBusy(false);
      setPasswordError(
        error instanceof PdfPasswordRequiredError
          ? error.code === 2
            ? t("dialog.openPassword.incorrect")
            : t("dialog.openPassword.failed")
          : error instanceof Error
            ? error.message
            : t("dialog.openPassword.failed")
      );
    }
  }, [passwordPrompt, t]);

  const cancelOpenPassword = useCallback(() => {
    setPasswordPrompt(null);
    setPasswordError(null);
    setPasswordBusy(false);
    useEditorStore.getState().setStatus("Open cancelled");
  }, []);

  const restoreRecoveredDraft = useCallback(async () => {
    const draft = recoveredDraft;
    if (!draft) return;
    try {
      // Reload through the normal path so pdf.js state is rebuilt, then put the
      // unsaved edit arrays back on top of it.
      await openPdfBytes(draft.pdfBytes, draft.fileName, { preserveExportScope: false });
      useEditorStore.getState().hydrateFromDraft(draft);
      useEditorStore.getState().setStatus(`Restored local draft of ${draft.fileName}`);
      setRecoveredDraft(null);
      setAutosaveProblem(null);
      setAutosaveEpoch((value) => value + 1);
    } catch (e) {
      if (e instanceof PdfPasswordRequiredError) {
        setPasswordPrompt({
          bytes: draft.pdfBytes,
          fileName: draft.fileName,
          incorrect: e.code === 2,
          draft,
        });
        setPasswordError(e.code === 2 ? t("dialog.openPassword.incorrect") : null);
        return;
      }
      useEditorStore
        .getState()
        .setStatus(e instanceof Error ? e.message : "Could not restore the draft");
    }
  }, [recoveredDraft, t]);

  const discardRecoveredDraft = useCallback(async () => {
    await clearDraft();
    setRecoveredDraft(null);
    setAutosaveProblem(null);
  }, []);

  const unlockRecoveredDraft = useCallback(async () => {
    if (!unlockPassphrase) return;
    setUnlockBusy(true);
    setUnlockError(null);
    const result = await unlockDraft(unlockPassphrase);
    setUnlockBusy(false);
    if (!result.ok) {
      setUnlockError(
        t(result.reason === "bad-passphrase" ? "draft.wrongPassphrase" : "draft.encryptionFailed")
      );
      return;
    }
    setUnlockPassphrase("");
    setLockedDraft(null);
    if (result.snapshot) setRecoveredDraft(result.snapshot);
    setAutosaveProblem(null);
    // Restart the paused autosave loop now that the in-memory key exists.
    setAutosaveEpoch((value) => value + 1);
  }, [t, unlockPassphrase]);

  const discardLockedDraft = useCallback(async () => {
    await clearDraft();
    setLockedDraft(null);
    setUnlockPassphrase("");
    setUnlockError(null);
    setAutosaveProblem(null);
  }, []);

  const deleteDraftNow = useCallback(async () => {
    const reason = autosaveProblem?.reason;
    await clearDraft();
    setRecoveredDraft(null);
    setLockedDraft(null);
    setAutosaveProblem(null);
    // A quota failure may clear once the record is gone; size/lock will not.
    if (reason === "quota") setAutosaveEpoch((value) => value + 1);
  }, [autosaveProblem]);

  const turnOffAutosave = useCallback(async () => {
    await setAutosaveEnabled(false);
    await clearDraft();
    setRecoveredDraft(null);
    setLockedDraft(null);
    setAutosaveProblem(null);
  }, []);

  useEffect(() => {
    (window as unknown as { __anyDocOpenFile?: (f: File) => void }).__anyDocOpenFile =
      handleOpenFile;
    return () => {
      delete (window as unknown as { __anyDocOpenFile?: (f: File) => void }).__anyDocOpenFile;
    };
  }, [handleOpenFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !inField && useEditorStore.getState().activeDialog !== "tool" && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
        return;
      }
      if (
        mod &&
        !inField &&
        useEditorStore.getState().activeDialog !== "tool" &&
        (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        void redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function seedImages() {
    const state = useEditorStore.getState();
    const bytes = state.pdfBytes;
    if (!bytes || state.imagesScanned) return;
    useEditorStore.getState().setImagesScanned(true);
    // Rasterising while the viewer paints the same document stalls both pdf.js renders.
    for (let i = 0; i < 60 && useEditorStore.getState().renderedPages === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 600));
    try {
      useEditorStore.getState().setImages(await extractPlacedImages(bytes));
    } catch {
      // A document whose images cannot be decoded simply has nothing to edit.
      useEditorStore.getState().setImages([]);
    }
  }

  async function burnRedactions(
    bytes: Uint8Array
  ): Promise<{ bytes: Uint8Array; burned: boolean; pages: number[] }> {
    const state = useEditorStore.getState();
    if (!state.redactions.length) return { bytes, burned: false, pages: [] };

    state.setStatus(`Burning ${state.redactions.length} redaction area(s)…`);
    const result = await redactPdf(
      bytes,
      state.redactions.map(({ pageIndex, x, y, width, height }) => ({
        pageIndex,
        x,
        y,
        width,
        height,
      })),
      { dpi: 300, padding: 0, stripMetadata: true },
      (msg) => useEditorStore.getState().setStatus(msg)
    );

    if (!result.verified) {
      throw new Error(
        `Redaction incomplete: ${result.remainingChars} character(s) survived. Widen the boxes and export again.`
      );
    }

    // The boxes are cleared by the reload that follows a successful save/export.
    // Clearing them here would silently drop pending redactions if that step failed,
    // and the next save would write the original, unredacted bytes.
    return { bytes: result.bytes, burned: true, pages: result.pages };
  }

  async function handleSave() {
    const state = useEditorStore.getState();
    let bytes = state.pdfBytes;
    if (!bytes) return;
    try {
      state.setStatus("Saving PDF…");
      // Pending redactions are destroyed before the file is written.
      const redacted = await burnRedactions(bytes);
      bytes = redacted.bytes;

      const hadImageEdits = useEditorStore.getState().images.some(imageNeedsBake);
      const hadTextObjects = useEditorStore.getState().textObjects.length > 0;
      bytes = await bakePendingEdits(bytes, state);
      if (hadImageEdits) {
        useEditorStore.getState().setImages(
          useEditorStore
            .getState()
            .images.filter((image) => !image.removed)
            .map((image) => ({
              ...image,
              original: { x: image.x, y: image.y, width: image.width, height: image.height },
              removed: false,
              replaced: false,
            }))
        );
      }
      const name = (state.fileName || "document.pdf").replace(/\.pdf$/i, "") + ".pdf";
      downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }), name);
      state.setPdfBytes(bytes);
      // Baked text now lives in the file, so drop the overlays or they would be drawn twice.
      if (hadTextObjects) state.setTextObjects([]);
      if (state.annotations.length || state.stickyNotes.length) {
        state.clearMarkup();
      }
      // Re-open the rewritten file so the viewer shows the burned pages.
      if (redacted.burned || hadTextObjects) await reloadFromBytes(bytes);
      state.setDirty(false);
      // The draft exists only to survive a crash before an explicit save.
      void clearDraft();
      setAutosaveProblem(null);
      state.setStatus(`Saved ${name}`);
    } catch (e) {
      state.setStatus(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handlePageAction(action: string) {
    const state = useEditorStore.getState();
    const bytes = state.pdfBytes;
    if (!bytes && action !== "merge") return;

    const snapshot = state;
    const journaled = new Set([
      "rotate-left",
      "rotate-right",
      "insert",
      "delete",
      "apply-redactions",
      "clear-redactions",
    ]);
    if (journaled.has(action)) state.pushHistory(`Before ${action}`);

    try {
      if (action === "rotate-left") {
        state.setStatus(`Rotating page ${state.currentPage}…`);
        const next = await rotatePage(bytes!, state.currentPage - 1, 270);
        await reloadFromBytes(next);
        restoreOverlays(snapshot);
        state.setStatus(`Rotated page ${state.currentPage}`);
        return;
      }
      if (action === "rotate-right") {
        state.setStatus(`Rotating page ${state.currentPage}…`);
        const next = await rotatePage(bytes!, state.currentPage - 1, 90);
        await reloadFromBytes(next);
        restoreOverlays(snapshot);
        state.setStatus(`Rotated page ${state.currentPage}`);
        return;
      }
      if (action === "insert") {
        state.setStatus("Inserting blank page…");
        const baked = await bakePendingEdits(bytes!, snapshot, { burnRedactions: true });
        const next = await insertBlankPage(baked, state.currentPage);
        await reloadFromBytes(next);
        clearOverlays();
        state.setStatus("Blank page inserted — choose a PDF to insert more pages…");
        insertInputRef.current?.click();
        return;
      }
      if (action === "merge") {
        mergeInputRef.current?.click();
        return;
      }
      if (action === "delete") {
        if (state.pageCount <= 1) {
          state.setStatus("Cannot delete the only page");
          return;
        }
        const baked = await bakePendingEdits(bytes!, snapshot, { burnRedactions: true });
        const next = await deletePages(baked, [state.currentPage - 1]);
        await reloadFromBytes(next);
        clearOverlays();
        state.setStatus(`Deleted page ${state.currentPage}`);
        return;
      }
      if (action === "extract") {
        const next = await extractPages(bytes!, [state.currentPage - 1]);
        downloadBlob(
          new Blob([next.buffer as ArrayBuffer], { type: "application/pdf" }),
          `page-${state.currentPage}.pdf`
        );
        state.setStatus(`Extracted page ${state.currentPage}`);
        return;
      }
      if (action === "split") {
        state.setStatus("Splitting…");
        const parts = await splitPdf(bytes!);
        const zip = new JSZip();
        parts.forEach((p) => zip.file(p.name, p.bytes));
        const blob = await zip.generateAsync({ type: "blob" });
        saveAs(blob, "split-pages.zip");
        state.setStatus(`Split into ${parts.length} files`);
        return;
      }
      if (action === "apply-redactions") {
        const boxes = state.redactions;
        if (!boxes.length) {
          state.setStatus("Drag at least one redaction box first");
          return;
        }
        state.setStatus(`Redacting ${boxes.length} area(s)…`);
        const result = await redactPdf(
          bytes!,
          boxes.map(({ pageIndex, x, y, width, height }) => ({ pageIndex, x, y, width, height })),
          { dpi: 300, padding: 0, stripMetadata: true },
          (msg) => state.setStatus(msg)
        );
        if (!result.verified) {

          state.setStatus(
            `Redaction incomplete — ${result.remainingChars} character(s) survived. Widen the boxes and retry.`
          );
          return;
        }
        await reloadFromBytes(result.bytes);
        const burned = new Set(result.pages);
        restoreOverlays({
          ...snapshot,
          annotations: snapshot.annotations.filter((item) => !burned.has(item.pageIndex)),
          stickyNotes: snapshot.stickyNotes.filter((item) => !burned.has(item.pageIndex)),
          comments: snapshot.comments.filter((item) => !burned.has(item.pageIndex)),
          formFields: snapshot.formFields.filter((item) => !burned.has(item.pageIndex)),
          ocrPages: snapshot.ocrPages.filter((item) => !burned.has(item.pageIndex)),
          images: snapshot.images.filter((item) => !burned.has(item.pageIndex)),
          redactions: snapshot.redactions.filter((item) => !burned.has(item.pageIndex)),
          textObjects: snapshot.textObjects.filter((item) => !burned.has(item.pageIndex)),
        });
        useEditorStore
          .getState()
          .setStatus(`Burned ${boxes.length} redaction area(s) — text is unrecoverable`);
        return;
      }
      if (action === "clear-redactions") {
        state.clearRedactions();
        state.setStatus("Redaction areas cleared");
        return;
      }
      if (action === "ocr") {
        void handleOcr();
        return;
      }
      if (action === "ocr-page") {
        void handleOcrPage();
        return;
      }
      if (action === "auto-detect") {
        void handleAutoDetect();
        return;
      }
    } catch (e) {
      state.setStatus(e instanceof Error ? e.message : "Page action failed");
    }
  }

  async function handleBatesApply(opts: BatesOptions) {
    const snapshot = useEditorStore.getState();
    const bytes = snapshot.pdfBytes;
    if (!bytes) return;
    setActiveDialog("none");
    snapshot.pushHistory("Before Bates numbering");
    useEditorStore.getState().setStatus("Applying Bates numbering…");
    const next = await applyBatesNumbering(bytes, opts);
    await reloadFromBytes(next);
    restoreOverlays({ ...snapshot, bates: { ...snapshot.bates, enabled: false } });
    useEditorStore.getState().setStatus("Bates numbering applied");
  }

  async function handleExport(format: string) {
    const state = useEditorStore.getState();
    const bytes = state.pdfBytes;
    if (!bytes) return;
    setActiveDialog("none");
    try {
      const scope = resolveExportScope(state.exportScope, state.currentPage, state.pageCount);

      if (format === "pdf") {
        state.setStatus("Exporting as PDF…");
        await handleSave();
        state.setStatus("Exported PDF successfully");
        return;
      }

      if (format === "xfdf" || format === "fdf" || format === "xml") {
        const xml = exportCommentsToFdf(state.comments, state.fileName || "document.pdf");
        const blob = new Blob([xml], { type: "application/vnd.adobe.xfdf" });
        saveAs(blob, `${(state.fileName || "document").replace(/\.pdf$/i, "")}-comments.xfdf`);
        state.setStatus("Exported comments data (XFDF)");
        return;
      }

      if (scope.error) {
        state.setStatus(scope.error);
        return;
      }

      const redacted = await burnRedactions(bytes);
      let safeBytes = redacted.bytes;
      // Edits live only in the store until save, so bake them here too or the export loses them.
      safeBytes = await bakePendingEdits(safeBytes, state);
      // Empty for a whole-document export, so those keep their plain name.
      const fileSuffix = scopeFileSuffix(scope.indices, state.pageCount);
      if (scope.indices && !isWholeDocument(scope.indices, state.pageCount)) {
        state.setStatus(`Exporting ${scope.label}…`);
        safeBytes = await extractPages(safeBytes, scope.indices);
      }

      if (format === "png" || format === "jpeg") {
        state.setStatus(`Rendering ${format.toUpperCase()} pages…`);
        state.setExportProgress({
          percent: 0,
          label: `Rendering ${format.toUpperCase()} pages…`,
        });
        const blobs = await renderPagesToBlobs(
          safeBytes,
          format === "png" ? "png" : "jpeg",
          1.5,
          (progress) => useEditorStore.getState().setExportProgress(progress)
        );
        const imageBase = (state.fileName || "page").replace(/\.pdf$/i, "");
        if (blobs.length === 1) {
          saveAs(blobs[0], addScopeToFilename(`${imageBase}.${format}`, fileSuffix));
        } else {
          state.setExportProgress({ percent: 95, label: "Packaging ZIP archive…" });
          const zip = new JSZip();
          blobs.forEach((b, i) => zip.file(`page-${i + 1}.${format}`, b));
          // Named after the document so a partial export cannot clobber a full one's archive.
          saveAs(await zip.generateAsync({ type: "blob" }), `${imageBase}${fileSuffix}.zip`);
        }
        state.setStatus(`Exported ${format.toUpperCase()}`);
        return;
      }

      // Every remaining format is generated entirely in this browser tab.
      state.setExportProgress({ percent: 0, label: `Preparing ${format.toUpperCase()} export…` });
      // OCR text is keyed by original page index; redacted pages are now pixels with
      // no text layer, so their pre-redaction transcript must not fill the export.
      const scopedPages =
        scope.indices && !isWholeDocument(scope.indices, state.pageCount) ? scope.indices : null;
      const ocrText = ocrTextForExport(
        state.ocrPages,
        scopedPages,
        new Set(redacted.pages)
      );
      const { blob, filename } = await exportDocument(safeBytes, format, {
        fileName: state.fileName || "document.pdf",
        onProgress: (progress) => useEditorStore.getState().setExportProgress(progress),
        ocrText,
      });

      saveAs(blob, addScopeToFilename(filename, fileSuffix));

      if (redacted.burned) await reloadFromBytes(redacted.bytes);
      state.setStatus(`Exported ${filename}`);
    } catch (e) {
      state.setStatus(e instanceof Error ? e.message : "Export failed");
    } finally {
      useEditorStore.getState().setExportProgress(null);
    }
  }

  async function handleRedactApply(box: {
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const snapshot = useEditorStore.getState();
    if (!snapshot.pdfBytes) return;
    setActiveDialog("none");
    snapshot.pushHistory("Before redaction");
    try {
      snapshot.setStatus("Rebuilding the page without the selected content…");
      const result = await redactPdf(
        snapshot.pdfBytes,
        [box],
        { dpi: 300, padding: 0, stripMetadata: true },
        (msg) => snapshot.setStatus(msg)
      );
      if (!result.verified) {
        snapshot.setStatus(
          `Redaction incomplete — ${result.remainingChars} character(s) survived. Use a wider area and retry.`
        );
        return;
      }
      await reloadFromBytes(result.bytes);
      const burned = new Set(result.pages);
      restoreOverlays({
        ...snapshot,
        annotations: snapshot.annotations.filter((item) => !burned.has(item.pageIndex)),
        stickyNotes: snapshot.stickyNotes.filter((item) => !burned.has(item.pageIndex)),
        comments: snapshot.comments.filter((item) => !burned.has(item.pageIndex)),
        formFields: snapshot.formFields.filter((item) => !burned.has(item.pageIndex)),
        ocrPages: snapshot.ocrPages.filter((item) => !burned.has(item.pageIndex)),
        images: snapshot.images.filter((item) => !burned.has(item.pageIndex)),
        redactions: snapshot.redactions.filter((item) => !burned.has(item.pageIndex)),
        textObjects: snapshot.textObjects.filter((item) => !burned.has(item.pageIndex)),
      });
      snapshot.setStatus("Redaction applied — page rebuilt as pixels, text is unrecoverable");
    } catch (err) {
      snapshot.setStatus(err instanceof Error ? err.message : "Redaction failed");
    }
  }

  async function handleSignatureApply(info: {
    signerName: string;
    organization?: string;
    reason?: string;
    location?: string;
    date: string;
    hash: string;
  }) {
    const snapshot = useEditorStore.getState();
    if (!snapshot.pdfBytes) return;
    setActiveDialog("none");
    snapshot.pushHistory("Before signature stamp");
    try {
      snapshot.setStatus("Stamping document integrity marker…");
      // Hash the real bytes here; the dialog cannot supply one and the stamp asserts no identity.
      const hash = await documentFingerprint(snapshot.pdfBytes);
      const next = await stampDigitalSignature(
        snapshot.pdfBytes,
        { ...info, hash },
        snapshot.currentPage - 1
      );
      await reloadFromBytes(next);
      restoreOverlays(snapshot);
      snapshot.setStatus("Integrity stamp applied — SHA-256 fingerprint, not a digital signature");
    } catch (err) {
      snapshot.setStatus(err instanceof Error ? err.message : "Signature failed");
    }
  }

  async function handleMetadataScrub() {
    const snapshot = useEditorStore.getState();
    if (!snapshot.pdfBytes) return;
    setActiveDialog("none");
    snapshot.pushHistory("Before metadata scrub");
    try {
      snapshot.setStatus("Scrubbing hidden metadata and author traces…");
      const next = await scrubPdfMetadata(snapshot.pdfBytes);
      await reloadFromBytes(next);
      restoreOverlays(snapshot);
      snapshot.setStatus("Document sanitized: all identifying metadata erased");
    } catch (err) {
      snapshot.setStatus(err instanceof Error ? err.message : "Scrub failed");
    }
  }

  async function handlePasswordApply() {
    // The browser build cannot write PDF encryption; say so instead of faking it.
    setActiveDialog("none");
    useEditorStore
      .getState()
      .setStatus("Password protection needs the desktop engine — nothing was changed");
  }

  async function handleCreate(kind: string) {
    setActiveDialog("none");
    setCreateKind(kind);
    if (kind === "text") {
      setActiveDialog("createText");
      return;
    }
    createInputRef.current?.click();
  }

  async function handleOcr() {
    const snapshot = useEditorStore.getState();
    const bytes = snapshot.pdfBytes;
    if (!bytes || ocrAbortRef.current) return;

    const controller = new AbortController();
    ocrAbortRef.current = controller;
    setOcrBusy(true);
    setOcrError(null);
    setOcrProgress({
      page: 1,
      total: snapshot.pageCount,
      status: "Starting OCR…",
      engine: "paddle",
    });
    setActiveDialog("ocr");
    snapshot.pushHistory("Before OCR");

    try {
      const next = await runOcrPipeline({
        bytes,
        language: snapshot.ocrLanguage || "eng",
        dpi: OCR_DPI,
        signal: controller.signal,
        onProgress: setOcrProgress,
      });
      await reloadFromBytes(
        next.bytes,
        (snapshot.fileName || "document").replace(/\.pdf$/i, "") + "-ocr.pdf"
      );
      restoreOverlays(snapshot);
      useEditorStore.getState().setStatus("OCR complete — document is searchable");
    } catch (e) {
      if (controller.signal.aborted) {
        useEditorStore.getState().setStatus("OCR cancelled");
        setOcrProgress(null);
        setOcrError(null);
        setActiveDialog("none");
        return;
      }
      const msg = e instanceof Error ? e.message : "OCR failed";
      setOcrError(msg);
      useEditorStore.getState().setStatus(msg);
      if (e instanceof Error && e.message.includes("not installed")) {
        setActiveDialog("ocrPacks");
      }
    } finally {
      // A cancel followed by a restart makes this run stale; only the run that
      // still owns the ref may clear the busy state it set.
      if (ocrAbortRef.current === controller) {
        ocrAbortRef.current = null;
        setOcrBusy(false);
      }
    }
  }

  function cancelOcr() {
    ocrAbortRef.current?.abort();
    ocrAbortRef.current = null;
    setOcrBusy(false);
    setOcrProgress(null);
    setOcrError(null);
    setActiveDialog("none");
  }

  function closeOcr() {
    if (ocrAbortRef.current) return;
    setOcrProgress(null);
    setOcrError(null);
    setActiveDialog("none");
  }

  async function handleOcrPage() {
    const state = useEditorStore.getState();
    const bytes = state.pdfBytes;
    if (!bytes) return;
    const pageNumber = state.currentPage;
    const ocrLang = state.ocrLanguage || "eng";
    try {
      // Recognition renders its own 2× canvas: the on-screen one is zoom-scaled and already busy.
      state.setStatus(`Rendering page ${pageNumber} at 2× for OCR…`);
      const rendered = await renderPageForOcr(bytes, pageNumber, 2);
      state.setStatus(
        rendered.skewAngle
          ? `Straightening page ${pageNumber} by ${Math.abs(rendered.skewAngle).toFixed(1)}° and reading it…`
          : `Reading page ${pageNumber} with Tesseract…`
      );
      const result = await recognizeCanvas(rendered.canvas, pageNumber - 1, {
        lang: ocrLang,
        dpi: rendered.dpi,
        skewAngle: rendered.skewAngle,
        onProgress: ({ status, progress }) => {
          const percent = progress > 0 ? ` ${Math.round(progress * 100)}%` : "";
          useEditorStore.getState().setStatus(`OCR page ${pageNumber}: ${status}${percent}`);
        },
      });
      useEditorStore.getState().setOcrPage(result);
      useEditorStore
        .getState()
        .setStatus(
          `OCR complete — ${result.words.length} words are now selectable on page ${pageNumber}`
        );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "OCR failed";
      useEditorStore.getState().setStatus(msg);
      if (e instanceof Error && e.message.includes("not installed")) {
        setActiveDialog("ocrPacks");
      }
    }
  }

  async function handleAutoDetect() {
    const state = useEditorStore.getState();
    const proxy = state.pdfDocProxy as {
      getPage: (n: number) => Promise<{
        getViewport: (o: { scale: number }) => { width: number; height: number };
        render: (o: unknown) => { promise: Promise<void> };
      }>;
    } | null;
    if (!proxy) return;
    state.setStatus("Auto-detecting form fields…");
    const page = await proxy.getPage(state.currentPage);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const detected = autoDetectFieldsFromCanvas(canvas, state.currentPage - 1);
    state.setFormFields([...state.formFields, ...detected]);
    state.setShowInspector(true);
    state.setStatus(`Detected ${detected.length} candidate fields — review in Properties`);
  }

  return (
    <>
      {lockedDraft && (
        <div
          role="dialog"
          aria-label={t("draft.encryption")}
          style={{
            position: "fixed",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 110,
            width: "min(560px, calc(100vw - 32px))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-elevated)",
            border: "1px solid var(--c-border-strong)",
            boxShadow: "var(--shadow-raised-lg)",
            fontSize: 12,
            color: "var(--c-text)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, lineHeight: 1.5 }}>
              <strong>
                {t("draft.lockedTitle", {
                  name: lockedDraft.fileName,
                  time: relativeDraftTime(lockedDraft.savedAt, t),
                })}
              </strong>
              <div style={{ color: "var(--c-text-muted)", marginTop: 4 }}>
                {t("draft.encryptionHint")}
              </div>
            </div>
            <button
              type="button"
              aria-label={t("draft.discard")}
              onClick={() => void discardLockedDraft()}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                color: "var(--c-icon-idle)",
                fontSize: 14,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              value={unlockPassphrase}
              onChange={(e) => {
                setUnlockPassphrase(e.target.value);
                setUnlockError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlockRecoveredDraft();
              }}
              placeholder={t("draft.passphrase")}
              aria-label={t("draft.passphrase")}
              autoComplete="off"
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "5px 8px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--c-border-strong)",
                backgroundColor: "var(--c-surface)",
                color: "var(--c-text)",
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={() => void unlockRecoveredDraft()}
              disabled={unlockBusy || unlockPassphrase.length === 0}
              style={{
                padding: "5px 10px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--c-primary)",
                backgroundColor: "var(--c-primary)",
                color: "#ffffff",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t("draft.unlock")}
            </button>
            <button
              type="button"
              onClick={() => void discardLockedDraft()}
              style={{
                padding: "5px 10px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--c-border-strong)",
                backgroundColor: "var(--c-surface-raised)",
                color: "var(--c-text)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("draft.discard")}
            </button>
          </div>
          {unlockError && (
            <span role="alert" style={{ color: "var(--c-text-muted)" }}>
              {unlockError}
            </span>
          )}
        </div>
      )}

      {recoveredDraft && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            width: "min(560px, calc(100vw - 32px))",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-elevated)",
            border: "1px solid var(--c-border-strong)",
            boxShadow: "var(--shadow-raised-lg)",
            fontSize: 12,
            color: "var(--c-text)",
          }}
        >
          <div style={{ flex: 1, lineHeight: 1.5 }}>
            {t("draft.restoreTitle", {
              name: recoveredDraft.fileName,
              time: relativeDraftTime(recoveredDraft.savedAt, t),
            })}
          </div>
          <button
            type="button"
            onClick={() => void restoreRecoveredDraft()}
            style={{
              padding: "5px 10px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--c-primary)",
              backgroundColor: "var(--c-primary)",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t("draft.restore")}
          </button>
          <button
            type="button"
            onClick={() => void discardRecoveredDraft()}
            style={{
              padding: "5px 10px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--c-border-strong)",
              backgroundColor: "var(--c-surface-raised)",
              color: "var(--c-text)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("draft.discard")}
          </button>
          <button
            type="button"
            aria-label={t("draft.discard")}
            onClick={() => setRecoveredDraft(null)}
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              color: "var(--c-icon-idle)",
              fontSize: 14,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}

      {autosaveProblem && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: 16,
            bottom: 96,
            zIndex: 100,
            width: 296,
            padding: "12px 14px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-elevated)",
            border: "1px solid var(--c-border-strong)",
            boxShadow: "var(--shadow-raised-lg)",
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--c-text)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span>
            {t("draft.autosavePaused", {
              reason: t(autosaveProblemReason(autosaveProblem.reason)),
            })}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void deleteDraftNow()}
              style={{
                padding: "4px 9px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--c-border-strong)",
                background: "transparent",
                color: "var(--c-text)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("draft.deleteNow")}
            </button>
            <button
              type="button"
              onClick={() => void turnOffAutosave()}
              style={{
                padding: "4px 9px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--c-border-strong)",
                background: "transparent",
                color: "var(--c-text-muted)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t("draft.turnOff")}
            </button>
          </div>
        </div>
      )}

      {showAutosaveNotice && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: 16,
            bottom: 96,
            zIndex: 100,
            width: 296,
            padding: "12px 14px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-elevated)",
            border: "1px solid var(--c-border-strong)",
            boxShadow: "var(--shadow-raised-lg)",
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--c-text)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span>{t("draft.notice")}</span>
          <span style={{ color: "var(--c-text-muted)", fontSize: 11 }}>
            {draftEncrypted ? t("draft.encrypted") : t("draft.unencrypted")}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowAutosaveNotice(false)}
              style={{
                padding: "4px 9px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--c-border-strong)",
                background: "transparent",
                color: "var(--c-text)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("draft.gotIt")}
            </button>
            <button
              type="button"
              onClick={() => {
                void setAutosaveEnabled(false);
                setShowAutosaveNotice(false);
              }}
              style={{
                padding: "4px 9px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--c-border-strong)",
                background: "transparent",
                color: "var(--c-text-muted)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t("draft.turnOff")}
            </button>
          </div>
        </div>
      )}

      <Workbench
        onOpenFile={() => fileInputRef.current?.click()}
        onSave={() => void handleSave()}
        onDownload={() => setActiveDialog("convert")}
        onCloseDocument={() => {
          void clearDraft();
          setRecoveredDraft(null);
          setLockedDraft(null);
          setAutosaveProblem(null);
          useEditorStore.getState().resetDocument();
        }}
        onPageAction={(a) => void handlePageAction(a)}
        onExport={(f) => void handleExport(f)}
        onCreate={(k) => void handleCreate(k)}
        onOcr={() => void handleOcr()}
        onAutoDetect={() => void handleAutoDetect()}
      />

      <input
        ref={fileInputRef}
        id="anydoc-file-input"
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleOpenFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={mergeInputRef}
        type="file"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (!files.length) return;
          const state = useEditorStore.getState();
          let buffers: Uint8Array[];
          try {
            buffers = await Promise.all(files.map((f) => readPdfFile(f)));
          } catch (err) {
            state.setStatus(err instanceof Error ? err.message : "Only PDF files can be merged");
            return;
          }
          const all = state.pdfBytes ? [state.pdfBytes, ...buffers] : buffers;
          state.setStatus("Merging…");
          const next = await mergePdfs(all);
          await openPdfBytes(next, "merged.pdf");
          state.setStatus(`Merged ${all.length} PDFs`);
        }}
      />
      <input
        ref={insertInputRef}
        type="file"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const state = useEditorStore.getState();
          if (!file || !state.pdfBytes) return;
          let src: Uint8Array;
          try {
            src = await readPdfFile(file);
          } catch (err) {
            state.setStatus(err instanceof Error ? err.message : "That file is not a valid PDF");
            return;
          }
          const next = await insertPagesFromFile(state.pdfBytes, src, state.currentPage);
          await reloadFromBytes(next);
          state.setStatus(`Inserted pages from ${file.name}`);
        }}
      />
      <input
        ref={createInputRef}
        type="file"
        multiple={createKind === "images"}
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (!files.length) return;
          const state = useEditorStore.getState();
          try {
            state.setStatus("Creating PDF…");
            if (createKind === "images") {
              // MIME comes from the file's signature, not from `file.type`.
              const images = await Promise.all(files.map((f) => readImageFile(f)));
              const next = await createPdfFromImages(images);
              await openPdfBytes(next, "from-images.pdf");
            } else if (createKind === "html") {
              const html = await files[0].text();
              const next = await createPdfFromHtml(html);
              await openPdfBytes(next, "from-html.pdf");
            } else if (createKind === "documents") {
              // Any file: routed by content, so a PDF here opens rather than fails.
              await handleOpenFile(files[0]);
            } else if (createKind === "docx" || createKind === "xlsx") {
              const next = await createPdfFromOffice(files[0]);
              await openPdfBytes(next, `from-${createKind}.pdf`);
            } else {
              const text = await files[0].text();
              const next = await createPdfFromText(text, files[0].name);
              await openPdfBytes(next, "from-text.pdf");
            }
            void clearDraft();
            state.setStatus("PDF created");
          } catch (err) {
            state.setStatus(err instanceof Error ? err.message : "Create failed");
          }
        }}
      />

      <FontBoot />
      <LocalFontsControls />
      <LocalDraftControls />

      {activeDialog === "bates" && (
        <BatesDialog
          onClose={() => setActiveDialog("none")}
          onApply={(o) => void handleBatesApply(o)}
        />
      )}
      {activeDialog === "convert" && (
        <ConvertDialog
          onClose={() => setActiveDialog("none")}
          onExport={(f) => void handleExport(f)}
          onCreate={(k) => void handleCreate(k)}
          onPdfA={() => setActiveDialog("pdfa")}
        />
      )}
      {activeDialog === "createText" && (
        <CreateTextDialog
          onClose={() => setActiveDialog("none")}
          onCreate={async (text) => {
            setActiveDialog("none");
            const next = await createPdfFromText(text);
            await openPdfBytes(next, "untitled.pdf");
            void clearDraft();
          }}
        />
      )}
      {activeDialog === "redact" && (
        <RedactionDialog
          onClose={() => setActiveDialog("none")}
          onApply={(box) => void handleRedactApply(box)}
        />
      )}
      {exportProgress && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 80,
            width: 300,
            padding: "14px 16px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-elevated)",
            border: "1px solid var(--c-border-subtle)",
            boxShadow: "var(--shadow-raised-lg)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text)" }}>
            {exportProgress.label}
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              backgroundColor: "var(--c-border-subtle)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${exportProgress.percent}%`,
                height: "100%",
                backgroundColor: "var(--c-primary)",
                transition: "width 160ms ease",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--c-text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {exportProgress.percent}% · runs in your browser
          </div>
        </div>
      )}

      {activeDialog === "signature" && (
        <DigitalSignatureDialog
          onClose={() => setActiveDialog("none")}
          onApply={(info) => void handleSignatureApply(info)}
        />
      )}
      {activeDialog === "metadata" && (
        <MetadataScrubDialog
          onClose={() => setActiveDialog("none")}
          onApply={() => void handleMetadataScrub()}
        />
      )}
      {activeDialog === "password" && (
        <PasswordDialog
          onClose={() => setActiveDialog("none")}
          onApply={() => void handlePasswordApply()}
        />
      )}
      {passwordPrompt && (
        <OpenPasswordDialog
          fileName={passwordPrompt.fileName}
          busy={passwordBusy}
          error={passwordError}
          onCancel={cancelOpenPassword}
          onSubmit={(password) => void submitOpenPassword(password)}
        />
      )}
      {activeDialog === "ocr" && (
        <OcrProgressModal
          open
          progress={ocrProgress}
          error={ocrError}
          busy={ocrBusy}
          onStart={() => void handleOcr()}
          onCancel={cancelOcr}
          onClose={closeOcr}
        />
      )}
      {activeDialog === "ocrPacks" && (
        <OcrPacksDialog onClose={() => setActiveDialog("none")} />
      )}
      {activeDialog === "batch" && <BatchDialog onClose={() => setActiveDialog("none")} />}
      {activeDialog === "pdfa" && (
        <PdfAPrepDialog
          bytes={pdfBytes}
          fileName={currentFileName ?? "document.pdf"}
          onClose={() => setActiveDialog("none")}
        />
      )}
      {activeDialog === "tool" && <ToolDialog />}
    </>
  );
}

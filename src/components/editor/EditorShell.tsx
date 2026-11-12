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
} from "./Dialogs";
import { ToolDialog } from "@/components/tools/ToolDialog";
import {
  documentFingerprint,
  stampDigitalSignature,
  scrubPdfMetadata,
  exportCommentsToFdf,
} from "@/lib/security/pdf-security";
import { redactPdf } from "@/lib/document/optimize";
import { applyAnnotationsToPdf } from "@/lib/edit/annotate";
import { applyImageEdits, imageNeedsBake } from "@/lib/edit/edit-engine";
import { useEditorStore } from "@/store/editor-store";
import { openPdfBytes, reloadFromBytes } from "@/lib/document/document-service";
import { downloadBlob } from "@/lib/document/load";
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
import { embedFormFields, autoDetectFieldsFromCanvas } from "@/lib/edit/forms";
import {
  createPdfFromHtml,
  createPdfFromOffice,
  renderPagesToBlobs,
} from "@/lib/document/convert-client";
import { exportDocument } from "@/lib/export";
import {
  addScopeToFilename,
  isWholeDocument,
  resolveExportScope,
  scopeFileSuffix,
} from "@/lib/export/scope";
import { runOcrOnPdf } from "@/lib/ocr/pdf-ocr";
import { recognizeCanvas, renderPageForOcr } from "@/lib/ocr/service";
import type { BatesOptions } from "@/lib/types";

type EditorSnapshot = ReturnType<typeof useEditorStore.getState>;

/** Bakes unsaved editor edits (images, markup, forms, Bates) into the bytes without mutating state. */
async function bakePendingEdits(bytes: Uint8Array, state: EditorSnapshot): Promise<Uint8Array> {
  let next = bytes;
  if (state.images.some(imageNeedsBake)) {
    next = await applyImageEdits(next, state.images);
  }
  if (state.annotations.length || state.stickyNotes.length) {
    next = await applyAnnotationsToPdf(next, state.annotations, state.stickyNotes, {
      opacity: state.markupOpacity,
    });
  }
  if (state.formFields.length) {
    next = await embedFormFields(next, state.formFields);
  }
  if (state.bates.enabled) {
    next = await applyBatesNumbering(next, state.bates);
  }
  return next;
}

export function EditorShell() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const insertInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const theme = useEditorStore((s) => s.theme);
  const tool = useEditorStore((s) => s.tool);
  const pdfBytes = useEditorStore((s) => s.pdfBytes);
  const exportProgress = useEditorStore((s) => s.exportProgress);
  const activeDialog = useEditorStore((s) => s.activeDialog);
  const setActiveDialog = useEditorStore((s) => s.setActiveDialog);
  const [createKind, setCreateKind] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
        await openPdfBytes(await readPdfFile(file), file.name);
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
    } catch (e) {
      state.setStatus(e instanceof Error ? e.message : "Could not open that file");
    }
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
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
  ): Promise<{ bytes: Uint8Array; burned: boolean }> {
    const state = useEditorStore.getState();
    if (!state.redactions.length) return { bytes, burned: false };

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

    useEditorStore.getState().clearRedactions();
    return { bytes: result.bytes, burned: true };
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
      if (state.annotations.length || state.stickyNotes.length) {
        state.clearMarkup();
      }
      // Re-open the rewritten file so the viewer shows the burned pages.
      if (redacted.burned) await reloadFromBytes(bytes);
      state.setDirty(false);
      state.setStatus(`Saved ${name}`);
    } catch (e) {
      state.setStatus(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handlePageAction(action: string) {
    const state = useEditorStore.getState();
    const bytes = state.pdfBytes;
    if (!bytes && action !== "merge") return;

    try {
      if (action === "rotate-left") {
        state.setStatus(`Rotating page ${state.currentPage}…`);
        const next = await rotatePage(bytes!, state.currentPage - 1, 270);
        await reloadFromBytes(next);
        state.setStatus(`Rotated page ${state.currentPage}`);
        return;
      }
      if (action === "rotate-right") {
        state.setStatus(`Rotating page ${state.currentPage}…`);
        const next = await rotatePage(bytes!, state.currentPage - 1, 90);
        await reloadFromBytes(next);
        state.setStatus(`Rotated page ${state.currentPage}`);
        return;
      }
      if (action === "insert") {
        state.setStatus("Inserting blank page…");
        const next = await insertBlankPage(bytes!, state.currentPage);
        await reloadFromBytes(next);
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
        const next = await deletePages(bytes!, [state.currentPage - 1]);
        await reloadFromBytes(next);
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
        useEditorStore.getState().clearRedactions();
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
    const bytes = useEditorStore.getState().pdfBytes;
    if (!bytes) return;
    setActiveDialog("none");
    useEditorStore.getState().setStatus("Applying Bates numbering…");
    const next = await applyBatesNumbering(bytes, opts);
    await reloadFromBytes(next);
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
      // OCR text is keyed by original page index; remap it when the export renumbers a subset.
      const scopedPages =
        scope.indices && !isWholeDocument(scope.indices, state.pageCount) ? scope.indices : null;
      const ocrText = new Map<number, string>();
      for (const page of state.ocrPages) {
        const target = scopedPages ? scopedPages.indexOf(page.pageIndex) : page.pageIndex;
        if (target >= 0) ocrText.set(target, page.text);
      }
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
    const state = useEditorStore.getState();
    if (!state.pdfBytes) return;
    setActiveDialog("none");
    try {
      state.setStatus("Rebuilding the page without the selected content…");
      const result = await redactPdf(
        state.pdfBytes,
        [box],
        { dpi: 300, padding: 0, stripMetadata: true },
        (msg) => state.setStatus(msg)
      );
      if (!result.verified) {
        state.setStatus(
          `Redaction incomplete — ${result.remainingChars} character(s) survived. Use a wider area and retry.`
        );
        return;
      }
      await reloadFromBytes(result.bytes);
      state.setStatus("Redaction applied — page rebuilt as pixels, text is unrecoverable");
    } catch (err) {
      state.setStatus(err instanceof Error ? err.message : "Redaction failed");
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
    const state = useEditorStore.getState();
    if (!state.pdfBytes) return;
    setActiveDialog("none");
    try {
      state.setStatus("Stamping document integrity marker…");
      // Hash the real bytes here; the dialog cannot supply one and the stamp asserts no identity.
      const hash = await documentFingerprint(state.pdfBytes);
      const next = await stampDigitalSignature(
        state.pdfBytes,
        { ...info, hash },
        state.currentPage - 1
      );
      await reloadFromBytes(next);
      state.setStatus("Integrity stamp applied — SHA-256 fingerprint, not a digital signature");
    } catch (err) {
      state.setStatus(err instanceof Error ? err.message : "Signature failed");
    }
  }

  async function handleMetadataScrub() {
    const state = useEditorStore.getState();
    if (!state.pdfBytes) return;
    setActiveDialog("none");
    try {
      state.setStatus("Scrubbing hidden metadata and author traces…");
      const next = await scrubPdfMetadata(state.pdfBytes);
      await reloadFromBytes(next);
      state.setStatus("Document sanitized: all identifying metadata erased");
    } catch (err) {
      state.setStatus(err instanceof Error ? err.message : "Scrub failed");
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
    const bytes = useEditorStore.getState().pdfBytes;
    if (!bytes) return;
    try {
      const next = await runOcrOnPdf(bytes, "eng", (msg) =>
        useEditorStore.getState().setStatus(msg)
      );
      await reloadFromBytes(
        next,
        (useEditorStore.getState().fileName || "document").replace(/\.pdf$/i, "") + "-ocr.pdf"
      );
      useEditorStore.getState().setStatus("OCR complete — document is searchable");
    } catch (e) {
      useEditorStore.getState().setStatus(e instanceof Error ? e.message : "OCR failed");
    }
  }

  async function handleOcrPage() {
    const state = useEditorStore.getState();
    const bytes = state.pdfBytes;
    if (!bytes) return;
    const pageNumber = state.currentPage;
    try {
      // Recognition renders its own 2× canvas: the on-screen one is zoom-scaled and already busy.
      state.setStatus(`Rendering page ${pageNumber} at 2× for OCR…`);
      const canvas = await renderPageForOcr(bytes, pageNumber, 2);
      state.setStatus(`Reading page ${pageNumber} with Tesseract…`);
      const result = await recognizeCanvas(canvas, pageNumber - 1, {
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
      useEditorStore.getState().setStatus(e instanceof Error ? e.message : "OCR failed");
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
      <Workbench
        onOpenFile={() => fileInputRef.current?.click()}
        onSave={() => void handleSave()}
        onDownload={() => setActiveDialog("convert")}
        onCloseDocument={() => useEditorStore.getState().resetDocument()}
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
            state.setStatus("PDF created");
          } catch (err) {
            state.setStatus(err instanceof Error ? err.message : "Create failed");
          }
        }}
      />

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
        />
      )}
      {activeDialog === "createText" && (
        <CreateTextDialog
          onClose={() => setActiveDialog("none")}
          onCreate={async (text) => {
            setActiveDialog("none");
            const next = await createPdfFromText(text);
            await openPdfBytes(next, "untitled.pdf");
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
      {activeDialog === "tool" && <ToolDialog />}
    </>
  );
}

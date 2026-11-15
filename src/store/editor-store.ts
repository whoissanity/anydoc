"use client";

import { create } from "zustand";
import type {
  ActiveDialog,
  AnnotationItem,
  AttachmentItem,
  BatesOptions,
  FormFieldDraft,
  ImageObject,
  LayerItem,
  LeftPane,
  OcrPage,
  OutlineItem,
  RedactBox,
  StickyNoteItem,
  TextEditSession,
  TextObject,
  Tool,
  ViewMode,
  WorkbenchView,
  ZoomMode,
} from "@/lib/types";
import type { CommentThread } from "@/lib/security/pdf-security";
import { DEFAULT_EXPORT_SCOPE, type ExportScope } from "@/lib/export/scope";
import type { Locale } from "@/lib/i18n/config";
import { ocrLanguageForLocale, savedOcrLanguage, saveOcrLanguage } from "@/lib/ocr/languages";

export interface EditorHistoryEntry {
  label: string;
  bytes: Uint8Array;
  fileName: string | null;
  pageCount: number;
  currentPage: number;
  zoom: number;
  zoomMode: ZoomMode;
  viewMode: ViewMode;
  annotations: AnnotationItem[];
  stickyNotes: StickyNoteItem[];
  comments: CommentThread[];
  formFields: FormFieldDraft[];
  ocrPages: OcrPage[];
  images: ImageObject[];
  redactions: RedactBox[];
  textObjects: TextObject[];
  imagesScanned: boolean;
  bates: BatesOptions;
  dirty: boolean;
}

interface EditorState {
  theme: "dark" | "light";
  fileName: string | null;
  fileSize: number;
  pdfBytes: Uint8Array | null;
  pdfDocProxy: unknown | null;
  /** True when the bytes were decrypted from a password-protected PDF; blocks plaintext drafts. */
  pdfDecrypted: boolean;
  pageCount: number;
  currentPage: number;
  zoom: number;
  zoomMode: ZoomMode;
  viewMode: ViewMode;
  leftPane: LeftPane;
  tool: Tool;
  currentView: WorkbenchView;
  activeDialog: ActiveDialog;
  activeToolId: string | null;
  searchQuery: string;
  dirty: boolean;
  /** Structural edit journal; entries hold bytes plus overlay state. */
  history: EditorHistoryEntry[];
  historyIndex: number;
  pushHistory: (label: string) => void;
  clearHistory: () => void;
  outline: OutlineItem[];
  attachments: AttachmentItem[];
  layers: LayerItem[];
  /** PDF.js optional-content config, kept out of the persisted draft. */
  optionalContentConfig: unknown | null;
  /** Bumped when a layer is toggled so canvas pages repaint with the new OCG state. */
  layerVersion: number;
  comments: CommentThread[];
  formFields: FormFieldDraft[];
  selectedFormId: string | null;
  images: ImageObject[];
  selectedImageId: string | null;
  /** Pages the viewer has finished painting; image extraction waits for one. */
  renderedPages: number;
  markPageRendered: () => void;
  /** The current document's images have been scanned (even if it has none). */
  imagesScanned: boolean;
  setImagesScanned: (scanned: boolean) => void;
  textEdit: TextEditSession | null;
  /** Placed text boxes that are still overlays; they are baked on save/export. */
  textObjects: TextObject[];
  selectedTextId: string | null;
  annotations: AnnotationItem[];
  stickyNotes: StickyNoteItem[];
  ocrPages: OcrPage[];
  ocrLanguage: string;
  /** Applies the saved OCR choice, or follows the UI language until one is made. */
  hydrateOcrLanguage: (locale: Locale) => void;
  annotColor: string;
  underlineColor: string;
  strikeColor: string;
  markupOpacity: number;
  redactions: RedactBox[];
  bates: BatesOptions;
  statusMessage: string;
  showInspector: boolean;
  showWelcome: boolean;
  /** Live progress for long-running client-side conversions. */
  exportProgress: { label: string; percent: number } | null;
  /** Which pages the converted formats cover. */
  exportScope: ExportScope;
  setExportScope: (patch: Partial<ExportScope>) => void;

  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  setPdf: (payload: {
    fileName: string;
    bytes: Uint8Array;
    pageCount: number;
    proxy: unknown;
    /** Reloading the same document after an edit must not reset the viewer. */
    preserveView?: boolean;
    /** True when the source PDF was decrypted after a password prompt. */
    decrypted?: boolean;
  }) => void;
  setPdfBytes: (bytes: Uint8Array) => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setZoomMode: (mode: ZoomMode) => void;
  setViewMode: (mode: ViewMode) => void;
  setLeftPane: (pane: LeftPane) => void;
  setTool: (tool: Tool) => void;
  toggleTool: (tool: Tool) => void;
  setCurrentView: (view: WorkbenchView) => void;
  setActiveDialog: (dialog: ActiveDialog) => void;
  setActiveTool: (toolId: string | null) => void;
  setFileName: (name: string) => void;
  setSearchQuery: (query: string) => void;
  setOutline: (outline: OutlineItem[]) => void;
  setAttachments: (items: AttachmentItem[]) => void;
  setLayers: (layers: LayerItem[]) => void;
  toggleLayer: (id: string) => void;
  setOptionalContentConfig: (config: unknown | null) => void;
  setComments: (comments: CommentThread[]) => void;
  addComment: (comment: CommentThread) => void;
  updateCommentStatus: (id: string, status: CommentThread["status"]) => void;
  addCommentReply: (id: string, reply: { author: string; text: string; date: string }) => void;
  removeComment: (id: string) => void;
  setFormFields: (fields: FormFieldDraft[]) => void;
  addFormField: (field: FormFieldDraft) => void;
  updateFormField: (id: string, patch: Partial<FormFieldDraft>) => void;
  removeFormField: (id: string) => void;
  setSelectedFormId: (id: string | null) => void;
  setImages: (images: ImageObject[]) => void;
  addImage: (image: ImageObject) => void;
  updateImage: (id: string, patch: Partial<ImageObject>) => void;
  removeImage: (id: string) => void;
  setSelectedImageId: (id: string | null) => void;
  setTextEdit: (session: TextEditSession | null) => void;
  setTextObjects: (objects: TextObject[]) => void;
  addTextObject: (object: TextObject) => void;
  updateTextObject: (id: string, patch: Partial<TextObject>) => void;
  removeTextObject: (id: string) => void;
  setSelectedTextId: (id: string | null) => void;
  addAnnotation: (a: AnnotationItem) => void;
  removeAnnotations: (ids: string[]) => void;
  clearAnnotations: (pageIndex?: number) => void;
  clearMarkup: () => void;
  addStickyNote: (note: StickyNoteItem) => void;
  removeStickyNote: (id: string) => void;
  setOcrPage: (page: OcrPage) => void;
  setOcrLanguage: (lang: string) => void;
  clearOcrPages: () => void;
  setAnnotColor: (color: string) => void;
  setAnnotColorFor: (type: "highlight" | "underline" | "strikethrough", color: string) => void;
  setMarkupOpacity: (opacity: number) => void;
  addRedaction: (box: RedactBox) => void;
  removeRedaction: (id: string) => void;
  clearRedactions: () => void;
  setBates: (patch: Partial<BatesOptions>) => void;
  setStatus: (msg: string) => void;
  setExportProgress: (progress: { label: string; percent: number } | null) => void;
  setDirty: (dirty: boolean) => void;
  setShowInspector: (show: boolean) => void;
  setShowWelcome: (show: boolean) => void;
  /** Rehydrates the unsaved edit state recovered from a local draft. */
  hydrateFromDraft: (payload: {
    annotations: AnnotationItem[];
    stickyNotes: StickyNoteItem[];
    formFields: FormFieldDraft[];
    ocrPages: OcrPage[];
    images: ImageObject[];
    redactions: RedactBox[];
    comments?: CommentThread[];
    textObjects?: TextObject[];
    dirty?: boolean;
  }) => void;
  resetDocument: () => void;
}

const defaultBates: BatesOptions = {
  enabled: false,
  prefix: "BATES-",
  start: 1,
  padding: 6,
  suffix: "",
  position: "bottom-right",
  fontSize: 10,
};

export const useEditorStore = create<EditorState>((set) => ({
  theme: "dark",
  fileName: null,
  fileSize: 0,
  pdfBytes: null,
  pdfDocProxy: null,
  pdfDecrypted: false,
  pageCount: 0,
  currentPage: 1,
  zoom: 1,
  zoomMode: "fit-width",
  viewMode: "continuous",
  leftPane: "thumbnails",
  tool: "select",
  currentView: "viewer",
  activeDialog: "none",
  activeToolId: null,
  searchQuery: "",
  dirty: false,
  history: [],
  historyIndex: -1,
  outline: [],
  attachments: [],
  layers: [],
  optionalContentConfig: null,
  layerVersion: 0,
  comments: [],
  formFields: [],
  selectedFormId: null,
  images: [],
  selectedImageId: null,
  renderedPages: 0,
  markPageRendered: () => set((s) => ({ renderedPages: s.renderedPages + 1 })),
  imagesScanned: false,
  setImagesScanned: (imagesScanned) => set({ imagesScanned }),
  textEdit: null,
  textObjects: [],
  selectedTextId: null,
  annotations: [],
  stickyNotes: [],
  ocrPages: [],
  ocrLanguage: "eng",
  annotColor: "#FFD600",
  underlineColor: "#000000",
  strikeColor: "#000000",
  markupOpacity: 0.42,
  redactions: [],
  bates: defaultBates,
  statusMessage: "Ready",
  showInspector: true,
  showWelcome: true,
  exportProgress: null,
  exportScope: DEFAULT_EXPORT_SCOPE,

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

  setPdf: ({ fileName, bytes, pageCount, proxy, preserveView, decrypted }) =>
    set((s) => ({
      fileName,
      fileSize: bytes.byteLength,
      pdfBytes: bytes,
      pageCount,
      pdfDocProxy: proxy,
      pdfDecrypted: preserveView ? s.pdfDecrypted : Boolean(decrypted),
      // An edit-triggered reload keeps the page and zoom the user is working at; only a
      // genuinely new document goes back to page 1 and re-arms fit-to-view.
      currentPage: preserveView ? Math.min(s.currentPage, pageCount) : 1,
      currentView: "viewer",
      zoom: preserveView ? s.zoom : 1,
      zoomMode: preserveView ? s.zoomMode : "fit-width",
      dirty: false,
      history: preserveView ? s.history : [],
      historyIndex: preserveView ? s.historyIndex : -1,
      showWelcome: false,
      formFields: [],
      images: [],
      selectedFormId: null,
      selectedImageId: null,
      renderedPages: 0,
      imagesScanned: false,
      textEdit: null,
      // Placed text survives an edit-triggered reload; only a new document clears it.
      textObjects: preserveView ? s.textObjects : [],
      selectedTextId: preserveView ? s.selectedTextId : null,
      annotations: [],
      stickyNotes: [],
      comments: preserveView ? s.comments : [],
      optionalContentConfig: preserveView ? s.optionalContentConfig : null,
      layerVersion: preserveView ? s.layerVersion : 0,
      ocrPages: [],
      redactions: [],
      statusMessage: `Opened ${fileName}`,
    })),
  setPdfBytes: (bytes) =>
    set({ pdfBytes: bytes, fileSize: bytes.byteLength, dirty: true }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setZoom: (zoom) => set({ zoom, zoomMode: "custom" }),
  setZoomMode: (zoomMode) => set({ zoomMode }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLeftPane: (leftPane) => set({ leftPane }),
  setTool: (tool) => set({ tool }),
  toggleTool: (tool) =>
    set((s) => ({ tool: s.tool === tool ? "select" : tool })),
  setCurrentView: (currentView) => set({ currentView }),
  setActiveDialog: (activeDialog) => set({ activeDialog }),
  setActiveTool: (activeToolId) => set({ activeToolId }),
  setFileName: (fileName) => set({ fileName, dirty: true }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setOutline: (outline) => set({ outline }),
  setAttachments: (attachments) => set({ attachments }),
  setLayers: (layers) => set({ layers }),
  setOptionalContentConfig: (optionalContentConfig) => set({ optionalContentConfig }),
  toggleLayer: (id) =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === id);
      const visible = layer ? !layer.visible : false;
      const config = s.optionalContentConfig as
        | { setGroup?: (id: string, visible: boolean) => void }
        | null;
      config?.setGroup?.(id, visible);
      return {
        layers: s.layers.map((l) => (l.id === id ? { ...l, visible } : l)),
        layerVersion: s.layerVersion + 1,
      };
    }),
  setComments: (comments) => set({ comments, dirty: true }),
  addComment: (comment) => set((s) => ({ comments: [comment, ...s.comments], dirty: true })),
  updateCommentStatus: (id, status) =>
    set((s) => ({
      comments: s.comments.map((c) => (c.id === id ? { ...c, status } : c)),
      dirty: true,
    })),
  addCommentReply: (id, reply) =>
    set((s) => ({
      comments: s.comments.map((c) =>
        c.id === id ? { ...c, replies: [...c.replies, reply] } : c
      ),
      dirty: true,
    })),
  removeComment: (id) =>
    set((s) => ({
      comments: s.comments.filter((c) => c.id !== id),
      dirty: true,
    })),
  setFormFields: (formFields) => set({ formFields, dirty: true }),
  addFormField: (field) =>
    set((s) => ({ formFields: [...s.formFields, field], dirty: true, selectedFormId: field.id })),
  updateFormField: (id, patch) =>
    set((s) => ({
      formFields: s.formFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      dirty: true,
    })),
  removeFormField: (id) =>
    set((s) => ({
      formFields: s.formFields.filter((f) => f.id !== id),
      selectedFormId: s.selectedFormId === id ? null : s.selectedFormId,
      dirty: true,
    })),
  setSelectedFormId: (selectedFormId) => set({ selectedFormId }),
  setImages: (images) => set({ images }),
  addImage: (image) =>
    set((s) => ({
      images: [...s.images, image],
      selectedImageId: image.id,
      // A user-inserted image must not be wiped by a later image scan.
      imagesScanned: true,
      dirty: true,
    })),
  updateImage: (id, patch) =>
    set((s) => ({
      images: s.images.map((img) => (img.id === id ? { ...img, ...patch } : img)),
      dirty: true,
    })),
  removeImage: (id) =>
    set((s) => ({
      images: s.images.filter((img) => img.id !== id),
      selectedImageId: s.selectedImageId === id ? null : s.selectedImageId,
      dirty: true,
    })),
  setSelectedImageId: (selectedImageId) => set({ selectedImageId }),
  setTextEdit: (textEdit) => set({ textEdit }),
  setTextObjects: (textObjects) => set({ textObjects }),
  addTextObject: (object) =>
    set((s) => ({
      textObjects: [...s.textObjects, object],
      selectedTextId: object.id,
      dirty: true,
    })),
  updateTextObject: (id, patch) =>
    set((s) => ({
      textObjects: s.textObjects.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      dirty: true,
    })),
  removeTextObject: (id) =>
    set((s) => ({
      textObjects: s.textObjects.filter((t) => t.id !== id),
      selectedTextId: s.selectedTextId === id ? null : s.selectedTextId,
      dirty: true,
    })),
  setSelectedTextId: (selectedTextId) => set({ selectedTextId }),
  addAnnotation: (a) =>
    set((s) => ({ annotations: [...s.annotations, a], dirty: true })),
  removeAnnotations: (ids) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => !ids.includes(a.id)),
      dirty: true,
    })),
  clearAnnotations: (pageIndex) =>
    set((s) => ({
      annotations:
        pageIndex !== undefined
          ? s.annotations.filter((a) => a.pageIndex !== pageIndex)
          : [],
      dirty: true,
    })),
  clearMarkup: () => set({ annotations: [], stickyNotes: [] }),
  addStickyNote: (note) =>
    set((s) => ({ stickyNotes: [...s.stickyNotes, note], dirty: true })),
  removeStickyNote: (id) =>
    set((s) => ({ stickyNotes: s.stickyNotes.filter((n) => n.id !== id), dirty: true })),
  setOcrPage: (page) =>
    set((s) => ({
      ocrPages: [...s.ocrPages.filter((p) => p.pageIndex !== page.pageIndex), page],
    })),
  hydrateOcrLanguage: (locale) =>
    set({ ocrLanguage: savedOcrLanguage() ?? ocrLanguageForLocale(locale) }),
  setOcrLanguage: (ocrLanguage) => {
    saveOcrLanguage(ocrLanguage);
    set({ ocrLanguage });
  },
  clearOcrPages: () => set({ ocrPages: [] }),
  setAnnotColor: (annotColor) => set({ annotColor }),
  setAnnotColorFor: (type, color) =>
    set(
      type === "highlight"
        ? { annotColor: color }
        : type === "underline"
        ? { underlineColor: color }
        : { strikeColor: color }
    ),
  setMarkupOpacity: (markupOpacity) => set({ markupOpacity }),
  addRedaction: (box) => set((s) => ({ redactions: [...s.redactions, box] })),
  removeRedaction: (id) =>
    set((s) => ({ redactions: s.redactions.filter((r) => r.id !== id) })),
  clearRedactions: () => set({ redactions: [] }),
  setBates: (patch) => set((s) => ({ bates: { ...s.bates, ...patch } })),
  pushHistory: (label) =>
    set((s) => {
      if (!s.pdfBytes) return {};
      const entry: EditorHistoryEntry = {
        label,
        bytes: s.pdfBytes.slice(),
        fileName: s.fileName,
        pageCount: s.pageCount,
        currentPage: s.currentPage,
        zoom: s.zoom,
        zoomMode: s.zoomMode,
        viewMode: s.viewMode,
        annotations: s.annotations,
        stickyNotes: s.stickyNotes,
        comments: s.comments,
        formFields: s.formFields,
        ocrPages: s.ocrPages,
        images: s.images,
        redactions: s.redactions,
        textObjects: s.textObjects,
        imagesScanned: s.imagesScanned,
        bates: { ...s.bates },
        dirty: s.dirty,
      };
      const entries = s.history.slice(0, s.historyIndex + 1);
      entries.push(entry);
      let totalBytes = entries.reduce((sum, item) => sum + item.bytes.byteLength, 0);
      while (entries.length > 20 || (totalBytes > 50 * 1024 * 1024 && entries.length > 1)) {
        const removed = entries.shift();
        if (removed) totalBytes -= removed.bytes.byteLength;
      }
      return { history: entries, historyIndex: entries.length - 1 };
    }),
  clearHistory: () => set({ history: [], historyIndex: -1 }),
  setStatus: (statusMessage) => set({ statusMessage }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  setExportScope: (patch) =>
    set((s) => ({ exportScope: { ...s.exportScope, ...patch } })),
  setDirty: (dirty) => set({ dirty }),
  setShowInspector: (showInspector) => set({ showInspector }),
  setShowWelcome: (showWelcome) => set({ showWelcome }),
  hydrateFromDraft: (payload) =>
    set({
      annotations: payload.annotations,
      stickyNotes: payload.stickyNotes,
      formFields: payload.formFields,
      ocrPages: payload.ocrPages,
      images: payload.images,
      redactions: payload.redactions,
      comments: payload.comments ?? [],
      textObjects: payload.textObjects ?? [],
      selectedFormId: null,
      selectedImageId: null,
      selectedTextId: null,
      dirty: payload.dirty ?? true,
      history: [],
      historyIndex: -1,
    }),
  resetDocument: () =>
    set({
      fileName: null,
      fileSize: 0,
    pdfBytes: null,
    pdfDocProxy: null,
    pdfDecrypted: false,
    pageCount: 0,
      currentPage: 1,
      currentView: "viewer",
      dirty: false,
      history: [],
      historyIndex: -1,
      outline: [],
      attachments: [],
      layers: [],
      optionalContentConfig: null,
      layerVersion: 0,
      comments: [],
      formFields: [],
      images: [],
      textEdit: null,
      textObjects: [],
      selectedTextId: null,
      annotations: [],
      stickyNotes: [],
      ocrPages: [],
      redactions: [],
      showWelcome: true,
      exportProgress: null,
  exportScope: DEFAULT_EXPORT_SCOPE,
      statusMessage: "Document closed",
    }),
}));

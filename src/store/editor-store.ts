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
  Tool,
  ViewMode,
  WorkbenchView,
  ZoomMode,
} from "@/lib/types";
import type { CommentThread } from "@/lib/security/pdf-security";
import { DEFAULT_EXPORT_SCOPE, type ExportScope } from "@/lib/export/scope";

interface EditorState {
  theme: "dark" | "light";
  fileName: string | null;
  fileSize: number;
  pdfBytes: Uint8Array | null;
  pdfDocProxy: unknown | null;
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
  outline: OutlineItem[];
  attachments: AttachmentItem[];
  layers: LayerItem[];
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
  annotations: AnnotationItem[];
  stickyNotes: StickyNoteItem[];
  ocrPages: OcrPage[];
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
  addAnnotation: (a: AnnotationItem) => void;
  clearAnnotations: (pageIndex?: number) => void;
  clearMarkup: () => void;
  addStickyNote: (note: StickyNoteItem) => void;
  removeStickyNote: (id: string) => void;
  setOcrPage: (page: OcrPage) => void;
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
  outline: [],
  attachments: [],
  layers: [],
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
  annotations: [],
  stickyNotes: [],
  ocrPages: [],
  annotColor: "#FFD600",
  underlineColor: "#1A64FF",
  strikeColor: "#DC3232",
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

  setPdf: ({ fileName, bytes, pageCount, proxy }) =>
    set({
      fileName,
      fileSize: bytes.byteLength,
      pdfBytes: bytes,
      pageCount,
      pdfDocProxy: proxy,
      currentPage: 1,
      currentView: "viewer",
      // Re-arm the fit-to-view logic so the viewer frames a freshly opened PDF.
      zoom: 1,
      zoomMode: "fit-width",
      dirty: false,
      showWelcome: false,
      formFields: [],
      images: [],
      selectedFormId: null,
      selectedImageId: null,
      renderedPages: 0,
      imagesScanned: false,
      textEdit: null,
      annotations: [],
      stickyNotes: [],
      ocrPages: [],
      redactions: [],
      statusMessage: `Opened ${fileName}`,
    }),
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
  toggleLayer: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),
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
  addAnnotation: (a) =>
    set((s) => ({ annotations: [...s.annotations, a], dirty: true })),
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
  setStatus: (statusMessage) => set({ statusMessage }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  setExportScope: (patch) =>
    set((s) => ({ exportScope: { ...s.exportScope, ...patch } })),
  setDirty: (dirty) => set({ dirty }),
  setShowInspector: (showInspector) => set({ showInspector }),
  setShowWelcome: (showWelcome) => set({ showWelcome }),
  resetDocument: () =>
    set({
      fileName: null,
      fileSize: 0,
      pdfBytes: null,
      pdfDocProxy: null,
      pageCount: 0,
      currentPage: 1,
      currentView: "viewer",
      dirty: false,
      outline: [],
      attachments: [],
      layers: [],
      formFields: [],
      images: [],
      textEdit: null,
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

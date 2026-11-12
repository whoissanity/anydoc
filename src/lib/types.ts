export type ViewMode = "single" | "continuous" | "spread" | "presentation";
export type LeftPane = "thumbnails" | "outline" | "attachments" | "layers" | "comments" | "none";
export type WorkbenchView = "viewer" | "pageEditor" | "fileEditor";
export type ActiveDialog =
  | "none"
  | "bates"
  | "convert"
  | "createText"
  | "insertPage"
  | "redact"
  | "signature"
  | "metadata"
  | "password"
  | "diff"
  | "tool";

export type Tool =
  | "select"
  | "hand"
  | "text-edit"
  | "text-add"
  | "image-edit"
  | "form-text"
  | "form-checkbox"
  | "form-radio"
  | "form-dropdown"
  | "form-signature"
  | "form-submit"
  | "highlight"
  | "underline"
  | "strikethrough"
  | "sticky-note"
  | "draw"
  | "shape-rect"
  | "redact-box";

export type ZoomMode = "custom" | "fit-width" | "fit-page";

export interface OutlineItem {
  title: string;
  pageIndex: number | null;
  items: OutlineItem[];
}

export interface AttachmentItem {
  filename: string;
  description?: string;
  content?: Uint8Array;
}

export interface LayerItem {
  id: string;
  name: string;
  visible: boolean;
}

export interface FormFieldDraft {
  id: string;
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "signature" | "submit";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
  options?: string[];
  checked?: boolean;
  calculateScript?: string;
  validateScript?: string;
}

export interface ImageObject {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** PNG data URL of the image content, used to re-embed it when edits are baked. */
  dataUrl?: string;
  /** Box the image occupied in the file; cleared when an edit is baked in. */
  original?: { x: number; y: number; width: number; height: number };
  /** Marked for deletion; the region is cleared on save. */
  removed?: boolean;
  /** Replacement pixels that are not yet baked into the file. */
  replaced?: boolean;
}

export interface BatesOptions {
  enabled: boolean;
  prefix: string;
  start: number;
  padding: number;
  suffix: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  fontSize: number;
}

export interface TextEditSession {
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface AnnotationItem {
  id: string;
  type: "highlight" | "underline" | "strikethrough" | "draw";
  pageIndex: number;
  color: string;
  /** Opacity used when baking highlights into the PDF (0–1). */
  opacity?: number;
  /** Zoom factor the marks were captured at, for freehand paths. */
  scale?: number;
  /** Rects in PDF user-space coordinates (unscaled) */
  rects: Array<{ x: number; y: number; width: number; height: number; lineY?: number }>;
}

export interface RedactBox {
  id: string;
  pageIndex: number;
  /** PDF user-space coordinates, origin bottom-left (unscaled points) */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StickyNoteItem {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  text: string;
  author: string;
  date: string;
  /** Zoom factor at capture time, so notes land correctly when baked. */
  scale?: number;
}

export interface OcrWordBox {
  text: string;
  confidence: number;
  /** Normalised 0–1 page coordinates so the overlay survives zooming. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrPage {
  pageIndex: number;
  text: string;
  words: OcrWordBox[];
  createdAt: number;
}

export interface DrawPath {
  id: string;
  pageIndex: number;
  color: string;
  strokeWidth: number;
  /** SVG path data string */
  d: string;
}

"use client";

import JSZip from "jszip";
import {
  BookOpen,
  Combine,
  Crop,
  Download,
  Droplets,
  Eraser,
  EyeOff,
  FileMinus,
  FileSearch,
  FileSignature,
  FileText,
  GitCompare,
  Hash,
  Images,
  Layers,
  LayoutGrid,
  ListTree,
  LockOpen,
  Minimize2,
  Palette,
  Paperclip,
  RotateCw,
  Rows3,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Stamp,
  Type,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { OutlineItem } from "@/lib/types";
import { loadPdfLib, PAGE_PRESETS, parsePageRange } from "@/lib/document/pages";
import {
  applyPageRotations,
  bookletPdf,
  cropPages,
  detectContentBoxes,
  marginsToBoxes,
  nUpPdf,
  overlayPdf,
  resizePages,
  rotateAllPages,
  singleLongPage,
  suggestRotations,
  type NUpLayout,
} from "@/lib/text/layout";
import {
  addPageNumbers,
  addWatermark,
  PAGE_NUMBER_PRESETS,
  type FontFamily,
  type Position9,
} from "@/lib/edit/marks";
import {
  addTextStamp,
  colorAdjustPdf,
  compressPdf,
  findTextRegions,
  flattenPdf,
  redactPdf,
  removeAnnotations,
  removeBlankPages,
  repairPdf,
  sanitizePdf,
  unlockForms,
  updateMetadata,
} from "@/lib/document/optimize";
import {
  addAttachmentToPdf,
  documentReport,
  extractPdfImages,
  suggestFileName,
} from "@/lib/inspect/extract";
import { comparePdfs } from "@/lib/inspect/compare";
import { formatBookmarkLines, parseBookmarkLines, writeBookmarks } from "@/lib/inspect/bookmarks";
import {
  splitByBookmarks,
  splitBySize,
  splitEveryN,
  splitOddEven,
  type SplitPart,
} from "@/lib/edit/split-advanced";

export type ToolCategory =
  | "Organize"
  | "Marks & Branding"
  | "Optimise"
  | "Security"
  | "Split & Merge"
  | "Inspect";

export type ParamValues = Record<string, string | number | boolean | File | null | undefined>;

export interface ToolParam {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "range" | "select" | "toggle" | "color" | "file";
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  /** Section heading shown above the control when it changes. */
  group?: string;
  /** Hide a control unless its sibling values match. */
  showIf?: (values: ParamValues) => boolean;
  suffix?: string;
}

export interface ToolContext {
  bytes: Uint8Array;
  fileName: string;
  pageCount: number;
  currentPage: number;
  outline: OutlineItem[];
  onProgress: (msg: string) => void;
}

export interface ToolReport {
  title: string;
  lines?: string[];
  stats?: Array<{ label: string; value: string; tone?: "good" | "warn" | "bad" }>;
  images?: Array<{ src: string; label: string }>;
  note?: string;
}

export interface ToolOutcome {
  bytes?: Uint8Array;
  rename?: string;
  download?: { blob: Blob; filename: string };
  message: string;
  /** Overall tone of the result banner. Defaults to "success" (green). */
  status?: "success" | "warn";
  report?: ToolReport;
}

export interface ToolDef {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: LucideIcon;
  keywords: string[];
  params?: ToolParam[];
  /** Seeds the form with values read from the open document. */
  prepare?: (ctx: ToolContext) => Promise<ParamValues>;
  run?: (ctx: ToolContext, values: ParamValues) => Promise<ToolOutcome>;
  /** Tools that already have a bespoke dialog in the editor. */
  opensDialog?: "redact" | "bates";
  /** Activates a canvas tool in the viewer instead of opening a dialog. */
  activateTool?: "redact-box";
  /** True when running the tool produces a download rather than an edited document. */
  downloads?: boolean;
  /** Feature that needs a desktop/server engine rather than this browser build. */
  unavailable?: string;
}

const text = (p: ParamValues, k: string, fallback = "") =>
  p[k] == null ? fallback : String(p[k]);
const num = (p: ParamValues, k: string, fallback = 0) =>
  p[k] == null || p[k] === "" ? fallback : Number(p[k]);
const bool = (p: ParamValues, k: string) => Boolean(p[k]);
const fileArg = (p: ParamValues, k: string): File | null =>
  p[k] instanceof File ? (p[k] as File) : null;

const POSITIONS: Array<{ value: string; label: string }> = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top centre" },
  { value: "top-right", label: "Top right" },
  { value: "middle-left", label: "Middle left" },
  { value: "middle-center", label: "Centre" },
  { value: "middle-right", label: "Middle right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
];

const PAPER_OPTIONS = [
  { value: "auto", label: "Match document" },
  { value: "a4", label: "A4" },
  { value: "letter", label: "US Letter" },
  { value: "legal", label: "US Legal" },
  { value: "a3", label: "A3" },
  { value: "a5", label: "A5" },
];

const pagesParam: ToolParam = {
  key: "pages",
  label: "Pages",
  type: "text",
  defaultValue: "",
  group: "Scope",
  hint: "Blank = all pages. Use 1-3, 5, 8-",
};

async function zipParts(parts: SplitPart[], filename: string) {
  const zip = new JSZip();
  parts.forEach((part) => zip.file(part.name, part.bytes));
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, filename };
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

export const TOOLS: ToolDef[] = [
  {
    id: "page-numbers",
    name: "Page numbers",
    description: "Add clean page numbers or footers with tokens for page, total, dates and custom text.",
    category: "Marks & Branding",
    icon: Hash,
    keywords: ["number", "pagination", "footer", "header", "bates"],
    params: [
      {
        key: "format",
        label: "Format",
        type: "select",
        defaultValue: "Page {n} of {total}",
        options: [...PAGE_NUMBER_PRESETS, { value: "custom", label: "Custom pattern…" }],
        group: "Content",
        hint: "Tokens: {n} page number, {total} page count, {p} physical page.",
      },
      {
        key: "customFormat",
        label: "Custom pattern",
        type: "text",
        defaultValue: "Page {n} of {total}",
        group: "Content",
        showIf: (v) => v.format === "custom",
      },
      { key: "position", label: "Position", type: "select", defaultValue: "bottom-center", options: POSITIONS, group: "Placement" },
      { key: "fontSize", label: "Font size", type: "range", defaultValue: 10, min: 6, max: 28, step: 1, group: "Placement", suffix: "pt" },
      { key: "marginX", label: "Side margin", type: "number", defaultValue: 36, min: 0, max: 200, group: "Placement" },
      { key: "marginY", label: "Edge margin", type: "number", defaultValue: 24, min: 0, max: 200, group: "Placement" },
      { key: "startNumber", label: "First number", type: "number", defaultValue: 1, min: 0, group: "Numbering" },
      { key: "bold", label: "Bold", type: "toggle", defaultValue: false, group: "Style" },
      { key: "color", label: "Colour", type: "color", defaultValue: "#3a3a3c", group: "Style" },
      { key: "opacity", label: "Opacity", type: "range", defaultValue: 1, min: 0.1, max: 1, step: 0.05, group: "Style" },
      { key: "skipFirst", label: "Skip first page", type: "toggle", defaultValue: false },
      pagesParam,
    ],
    run: async (ctx, v) => {
      const format = v.format === "custom" ? text(v, "customFormat") : text(v, "format");
      const targets = parsePageRange(text(v, "pages"), ctx.pageCount);
      const bytes = await addPageNumbers(
        ctx.bytes,
        {
          format,
          position: text(v, "position", "bottom-center") as Position9,
          marginX: num(v, "marginX", 36),
          marginY: num(v, "marginY", 24),
          fontSize: num(v, "fontSize", 10),
          family: "Helvetica" as FontFamily,
          bold: bool(v, "bold"),
          color: text(v, "color", "#3a3a3c"),
          opacity: num(v, "opacity", 1),
          startNumber: num(v, "startNumber", 1),
          startPage: 0,
          skipFirstPage: bool(v, "skipFirst"),
        },
        targets
      );
      return {
        bytes,
        message: `Numbered ${targets.length} page${targets.length === 1 ? "" : "s"}`,
      };
    },
  },
  {
    id: "watermark",
    name: "Watermark & stamp",
    description: "Overlay text or a logo diagonally, tiled across the page, or as a header/footer band.",
    category: "Marks & Branding",
    icon: Droplets,
    keywords: ["watermark", "stamp", "logo", "confidential", "draft", "branding"],
    params: [
      {
        key: "kind",
        label: "Type",
        type: "select",
        defaultValue: "text",
        options: [
          { value: "text", label: "Text" },
          { value: "image", label: "Image / logo" },
        ],
        group: "Content",
      },
      { key: "text", label: "Text", type: "text", defaultValue: "CONFIDENTIAL", group: "Content", showIf: (v) => v.kind !== "image" },
      { key: "image", label: "Image", type: "file", group: "Content", showIf: (v) => v.kind === "image" },
      {
        key: "layout",
        label: "Layout",
        type: "select",
        defaultValue: "single",
        options: [
          { value: "single", label: "Single diagonal" },
          { value: "tile", label: "Tiled pattern" },
          { value: "header", label: "Header band" },
          { value: "footer", label: "Footer band" },
        ],
        group: "Placement",
      },
      { key: "position", label: "Anchor", type: "select", defaultValue: "middle-center", options: POSITIONS, group: "Placement", showIf: (v) => v.layout === "single" && v.kind !== "image" },
      { key: "fontSize", label: "Font size", type: "range", defaultValue: 64, min: 8, max: 160, step: 2, group: "Placement", suffix: "pt" },
      { key: "rotation", label: "Rotation", type: "range", defaultValue: 45, min: -90, max: 90, step: 5, group: "Placement", suffix: "°", showIf: (v) => v.layout === "single" },
      { key: "tileGapX", label: "Tile spacing (horizontal)", type: "range", defaultValue: 40, min: 0, max: 160, group: "Placement", showIf: (v) => v.layout === "tile" },
      { key: "tileGapY", label: "Tile spacing (vertical)", type: "range", defaultValue: 60, min: 0, max: 200, group: "Placement", showIf: (v) => v.layout === "tile" },
      { key: "imageScale", label: "Image width", type: "range", defaultValue: 0.4, min: 0.05, max: 1, step: 0.05, group: "Placement", showIf: (v) => v.kind === "image" },
      { key: "color", label: "Colour", type: "color", defaultValue: "#FF453A", group: "Style", showIf: (v) => v.kind !== "image" },
      { key: "opacity", label: "Opacity", type: "range", defaultValue: 0.18, min: 0.02, max: 1, step: 0.02, group: "Style" },
      { key: "bold", label: "Bold", type: "toggle", defaultValue: true, group: "Style", showIf: (v) => v.kind !== "image" },
      pagesParam,
    ],
    run: async (ctx, v) => {
      const kind = text(v, "kind", "text") as "text" | "image";
      const image = fileArg(v, "image");
      if (kind === "image" && !image) throw new Error("Choose an image for the watermark");
      const targets = parsePageRange(text(v, "pages"), ctx.pageCount);
      const bytes = await addWatermark(
        ctx.bytes,
        {
          kind,
          text: text(v, "text", "CONFIDENTIAL"),
          fontSize: num(v, "fontSize", 64),
          family: "Helvetica",
          bold: bool(v, "bold"),
          color: text(v, "color", "#FF453A"),
          opacity: num(v, "opacity", 0.18),
          rotation: num(v, "rotation", 45),
          layout: text(v, "layout", "single") as "single" | "tile" | "header" | "footer",
          position: text(v, "position", "middle-center") as Position9,
          tileGapX: num(v, "tileGapX", 40),
          tileGapY: num(v, "tileGapY", 60),
          imageScale: num(v, "imageScale", 0.4),
          imageBytes: image ? new Uint8Array(await image.arrayBuffer()) : undefined,
          imageMime: image?.type,
        },
        targets
      );
      return { bytes, message: `Watermark applied to ${targets.length} page(s)` };
    },
  },
  {
    id: "stamp",
    name: "Status stamp",
    description: "Place an APPROVED / DRAFT style stamp block, with optional outline, on every page.",
    category: "Marks & Branding",
    icon: Stamp,
    keywords: ["stamp", "approved", "draft", "review", "status"],
    params: [
      { key: "text", label: "Stamp text", type: "text", defaultValue: "APPROVED" },
      { key: "fontSize", label: "Font size", type: "range", defaultValue: 36, min: 10, max: 96, group: "Style" },
      { key: "color", label: "Colour", type: "color", defaultValue: "#30D158", group: "Style" },
      { key: "opacity", label: "Opacity", type: "range", defaultValue: 0.75, min: 0.1, max: 1, step: 0.05, group: "Style" },
      { key: "border", label: "Draw outline", type: "toggle", defaultValue: true, group: "Style" },
    ],
    run: async (ctx, v) => ({
      bytes: await addTextStamp(ctx.bytes, {
        text: text(v, "text", "APPROVED"),
        fontSize: num(v, "fontSize", 36),
        color: text(v, "color", "#30D158"),
        opacity: num(v, "opacity", 0.75),
        rotation: 0,
        border: bool(v, "border"),
      }),
      message: `Stamped every page with “${text(v, "text", "APPROVED")}”`,
    }),
  },
  {
    id: "overlay",
    name: "Overlay a PDF",
    description: "Stamp a second PDF over every page — letterheads, backgrounds or approval pages.",
    category: "Marks & Branding",
    icon: Combine,
    keywords: ["overlay", "letterhead", "background", "combine", "stamp"],
    params: [
      { key: "file", label: "Overlay PDF", type: "file", group: "Overlay" },
      { key: "opacity", label: "Opacity", type: "range", defaultValue: 0.85, min: 0.05, max: 1, step: 0.05, group: "Overlay" },
      {
        key: "scale",
        label: "Scaling",
        type: "select",
        defaultValue: "fit",
        options: [
          { value: "fit", label: "Fit to page" },
          { value: "actual", label: "Actual size, centred" },
        ],
        group: "Overlay",
      },
      { key: "repeat", label: "Repeat the last overlay page", type: "toggle", defaultValue: true },
    ],
    run: async (ctx, v) => {
      const file = fileArg(v, "file");
      if (!file) throw new Error("Choose the PDF to overlay");
      const result = await overlayPdf(ctx.bytes, new Uint8Array(await file.arrayBuffer()), {
        opacity: num(v, "opacity", 0.85),
        repeatLast: bool(v, "repeat"),
        scale: text(v, "scale", "fit") as "fit" | "actual",
      });
      return { bytes: result.bytes, message: `Overlay applied to ${result.applied} page(s)` };
    },
  },
  {
    id: "crop",
    name: "Crop pages",
    description: "Trim margins by hand or auto-detect the whitespace around the real content.",
    category: "Organize",
    icon: Crop,
    keywords: ["crop", "trim", "margins", "whitespace", "scan"],
    params: [
      {
        key: "mode",
        label: "Method",
        type: "select",
        defaultValue: "auto",
        options: [
          { value: "auto", label: "Auto-trim whitespace" },
          { value: "margins", label: "Fixed margins" },
        ],
        group: "Crop",
      },
      { key: "padding", label: "Keep padding", type: "range", defaultValue: 6, min: 0, max: 40, group: "Crop", suffix: "pt", showIf: (v) => v.mode === "auto" },
      { key: "top", label: "Top margin", type: "number", defaultValue: 18, min: 0, group: "Margins", showIf: (v) => v.mode === "margins" },
      { key: "bottom", label: "Bottom margin", type: "number", defaultValue: 18, min: 0, group: "Margins", showIf: (v) => v.mode === "margins" },
      { key: "left", label: "Left margin", type: "number", defaultValue: 18, min: 0, group: "Margins", showIf: (v) => v.mode === "margins" },
      { key: "right", label: "Right margin", type: "number", defaultValue: 18, min: 0, group: "Margins", showIf: (v) => v.mode === "margins" },
      pagesParam,
    ],
    run: async (ctx, v) => {
      const targets = parsePageRange(text(v, "pages"), ctx.pageCount);
      const doc = await loadPdfLib(ctx.bytes);
      const pages = targets.map((pageIndex) => {
        const { width, height } = doc.getPage(pageIndex).getSize();
        return { pageIndex, width, height };
      });

      if (text(v, "mode", "auto") === "auto") {
        const boxes = await detectContentBoxes(ctx.bytes, targets, num(v, "padding", 6), ctx.onProgress);
        if (!boxes.length) throw new Error("Could not find any content to crop around");
        return {
          bytes: await cropPages(ctx.bytes, boxes),
          message: `Auto-trimmed ${boxes.length} page(s)`,
        };
      }

      const boxes = marginsToBoxes(
        {
          top: num(v, "top", 18),
          bottom: num(v, "bottom", 18),
          left: num(v, "left", 18),
          right: num(v, "right", 18),
        },
        pages
      );
      return { bytes: await cropPages(ctx.bytes, boxes), message: `Cropped ${boxes.length} page(s)` };
    },
  },
  {
    id: "resize",
    name: "Resize to paper",
    description: "Scale every page onto A4, Letter, Legal or a custom size — for consistent printing.",
    category: "Organize",
    icon: SlidersHorizontal,
    keywords: ["resize", "scale", "paper", "a4", "letter", "fit"],
    params: [
      {
        key: "preset",
        label: "Paper size",
        type: "select",
        defaultValue: "a4",
        options: [
          { value: "a4", label: "A4" },
          { value: "letter", label: "US Letter" },
          { value: "legal", label: "US Legal" },
          { value: "a3", label: "A3" },
          { value: "a5", label: "A5" },
          { value: "custom", label: "Custom size…" },
        ],
        group: "Paper",
      },
      { key: "width", label: "Width", type: "number", defaultValue: 595, min: 50, group: "Paper", showIf: (v) => v.preset === "custom", suffix: "pt" },
      { key: "height", label: "Height", type: "number", defaultValue: 842, min: 50, group: "Paper", showIf: (v) => v.preset === "custom", suffix: "pt" },
      {
        key: "orientation",
        label: "Orientation",
        type: "select",
        defaultValue: "auto",
        options: [
          { value: "auto", label: "Keep per page" },
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ],
        group: "Paper",
      },
      {
        key: "fit",
        label: "Scaling",
        type: "select",
        defaultValue: "contain",
        options: [
          { value: "contain", label: "Fit with margins (no distortion)" },
          { value: "stretch", label: "Stretch to fill" },
        ],
        group: "Paper",
      },
    ],
    run: async (ctx, v) => {
      const preset = text(v, "preset", "a4") as keyof typeof PAGE_PRESETS | "custom";
      const bytes = await resizePages(ctx.bytes, {
        preset,
        width: num(v, "width", 595),
        height: num(v, "height", 842),
        orientation: text(v, "orientation", "auto") as "auto" | "portrait" | "landscape",
        fit: text(v, "fit", "contain") as "contain" | "stretch",
      });
      return { bytes, message: `Resized ${ctx.pageCount} page(s)` };
    },
  },
  {
    id: "nup",
    name: "Multiple pages per sheet",
    description: "Print handouts: 2, 4, 6 or 9 pages per sheet, ready for paper-saving printing.",
    category: "Organize",
    icon: LayoutGrid,
    keywords: ["n-up", "pages per sheet", "handout", "print", "booklet", "2-up"],
    params: [
      {
        key: "layout",
        label: "Grid",
        type: "select",
        defaultValue: "2x1",
        options: [
          { value: "2x1", label: "2 per sheet (side by side)" },
          { value: "1x2", label: "2 per sheet (stacked)" },
          { value: "2x2", label: "4 per sheet" },
          { value: "3x2", label: "6 per sheet" },
          { value: "3x3", label: "9 per sheet" },
        ],
        group: "Sheet",
      },
      { key: "preset", label: "Sheet size", type: "select", defaultValue: "auto", options: PAPER_OPTIONS, group: "Sheet" },
      { key: "gap", label: "Gap between pages", type: "range", defaultValue: 8, min: 0, max: 48, group: "Sheet" },
      { key: "margin", label: "Sheet margin", type: "range", defaultValue: 18, min: 0, max: 72, group: "Sheet" },
      { key: "border", label: "Draw cell borders", type: "toggle", defaultValue: false, group: "Sheet" },
      { key: "repeat", label: "Repeat last page to fill sheet", type: "toggle", defaultValue: false },
    ],
    run: async (ctx, v) => ({
      bytes: await nUpPdf(
        ctx.bytes,
        {
          layout: text(v, "layout", "2x1") as NUpLayout,
          preset: text(v, "preset", "auto") as keyof typeof PAGE_PRESETS | "auto",
          gap: num(v, "gap", 8),
          margin: num(v, "margin", 18),
          border: bool(v, "border"),
          repeat: bool(v, "repeat"),
        },
        ctx.onProgress
      ),
      message: "Sheet layout created",
    }),
  },
  {
    id: "booklet",
    name: "Booklet imposition",
    description: "Reorder pages for folding and stapling so a printed stack reads like a booklet.",
    category: "Organize",
    icon: BookOpen,
    keywords: ["booklet", "imposition", "saddle", "fold", "print"],
    params: [
      { key: "gutter", label: "Centre gutter", type: "range", defaultValue: 0, min: 0, max: 60, group: "Layout" },
      { key: "margin", label: "Sheet margin", type: "range", defaultValue: 12, min: 0, max: 60, group: "Layout" },
    ],
    run: async (ctx, v) => ({
      bytes: await bookletPdf(ctx.bytes, {
        gutter: num(v, "gutter", 0),
        margin: num(v, "margin", 12),
      }),
      message: "Booklet page order applied — print double-sided and fold",
    }),
  },
  {
    id: "long-page",
    name: "Join into one long page",
    description: "Stitch every page into a single continuous sheet, ideal for chat logs and receipts.",
    category: "Organize",
    icon: Rows3,
    keywords: ["single page", "join", "stitch", "long", "continuous"],
    params: [
      { key: "gap", label: "Gap between pages", type: "range", defaultValue: 0, min: 0, max: 60, group: "Layout" },
      { key: "maxWidth", label: "Minimum width", type: "number", defaultValue: 612, min: 100, group: "Layout" },
    ],
    run: async (ctx, v) => ({
      bytes: await singleLongPage(ctx.bytes, {
        gap: num(v, "gap", 0),
        maxWidth: num(v, "maxWidth", 612),
      }),
      message: "Pages joined into one continuous sheet",
    }),
  },
  {
    id: "bookmarks",
    name: "Edit table of contents",
    description: "Rewrite the bookmark outline in bulk — every line becomes a clickable chapter.",
    category: "Organize",
    icon: ListTree,
    keywords: ["bookmarks", "outline", "toc", "chapters", "navigation"],
    params: [
      {
        key: "bookmarks",
        label: "Bookmarks",
        type: "textarea",
        defaultValue: "",
        hint: "One per line: “Title | page”. Clear every line to remove the outline.",
        group: "Outline",
      },
    ],
    prepare: async (ctx) => ({ bookmarks: formatBookmarkLines(ctx.outline) }),
    run: async (ctx, v) => {
      const raw = text(v, "bookmarks").trim();
      const entries = parseBookmarkLines(raw, ctx.pageCount);
      if (raw && !entries.length) {
        throw new Error("No valid lines — use “Title | page”, for example: Introduction | 1");
      }
      const result = await writeBookmarks(ctx.bytes, entries);
      return {
        bytes: result.bytes,
        message: result.count ? `Saved ${result.count} bookmark(s)` : "Removed all bookmarks",
      };
    },
  },
  {
    id: "rotate-all",
    name: "Rotate all pages",
    description: "Rotate the whole document in one click — no per-page clicking.",
    category: "Organize",
    icon: RotateCw,
    keywords: ["rotate", "landscape", "portrait", "turn"],
    params: [
      {
        key: "angle",
        label: "Rotation",
        type: "select",
        defaultValue: "90",
        options: [
          { value: "90", label: "90° clockwise" },
          { value: "180", label: "180°" },
          { value: "270", label: "90° anticlockwise" },
        ],
      },
    ],
    run: async (ctx, v) => ({
      bytes: await rotateAllPages(ctx.bytes, Number(text(v, "angle", "90")) as 90 | 180 | 270),
      message: "Rotated all pages",
    }),
  },
  {
    id: "auto-rotate",
    name: "Auto-rotate sideways pages",
    description: "Detects pages whose text runs sideways or upside-down and turns them upright.",
    category: "Organize",
    icon: Sparkles,
    keywords: ["auto rotate", "sideways", "upright", "deskew", "orientation"],
    run: async (ctx) => {
      ctx.onProgress("Detecting text orientation…");
      const guesses = await suggestRotations(ctx.bytes);
      const fixes = guesses.filter((g) => g.angle !== 0 && g.confidence >= 0.55);
      if (!fixes.length) {
        return {
          message: "Every page already looks upright",
          report: { title: "Nothing to rotate", lines: ["No page had a dominant sideways text direction."] },
        };
      }
      const bytes = await applyPageRotations(ctx.bytes, fixes);
      return {
        bytes,
        message: `Rotated ${fixes.length} page(s) upright`,
        report: {
          title: "Rotation applied",
          lines: fixes.map(
            (f) => `Page ${f.pageIndex + 1}: +${f.angle}° (${Math.round(f.confidence * 100)}% confident)`
          ),
        },
      };
    },
  },
  {
    id: "compress",
    name: "Compress",
    description: "Shrink file size with a lossless rebuild or a quality-controlled downsampling of each page.",
    category: "Optimise",
    icon: Minimize2,
    keywords: ["compress", "shrink", "size", "optimise", "email", "reduce"],
    params: [
      {
        key: "mode",
        label: "Mode",
        type: "select",
        defaultValue: "raster",
        options: [
          { value: "raster", label: "Strong — downsample pages" },
          { value: "lossless", label: "Safe — rebuild structure only" },
        ],
        group: "Compression",
        hint: "Strong mode turns pages into images: smaller, but text stops being selectable.",
      },
      {
        key: "dpi",
        label: "Resolution",
        type: "select",
        defaultValue: "150",
        options: [
          { value: "96", label: "Screen (96 DPI)" },
          { value: "150", label: "Balanced (150 DPI)" },
          { value: "200", label: "Print (200 DPI)" },
          { value: "300", label: "High (300 DPI)" },
        ],
        group: "Compression",
        showIf: (v) => v.mode !== "lossless",
      },
      { key: "quality", label: "Image quality", type: "range", defaultValue: 0.7, min: 0.3, max: 0.95, step: 0.05, group: "Compression", showIf: (v) => v.mode !== "lossless" },
      { key: "grayscale", label: "Convert to grayscale", type: "toggle", defaultValue: false, group: "Compression", showIf: (v) => v.mode !== "lossless" },
    ],
    run: async (ctx, v) => {
      const result = await compressPdf(
        ctx.bytes,
        {
          mode: text(v, "mode", "raster") as "lossless" | "raster",
          dpi: num(v, "dpi", 150),
          quality: num(v, "quality", 0.7),
          grayscale: bool(v, "grayscale"),
        },
        ctx.onProgress
      );
      // after <= before always: the writer keeps the original bytes when a
      // rebuild would inflate the file, so the delta can never go negative.
      const delta = result.before - result.after;
      const pct = result.before > 0 ? (delta / result.before) * 100 : 0;

      if (!result.reduced) {
        // Nothing shrank, so the document is left as-is — no reload, no dirty flag, no bloated file.
        return {
          status: "warn",
          message: "File size could not be reduced further",
          report: {
            title: "Already optimised",
            stats: [
              { label: "Before", value: sizeLabel(result.before) },
              { label: "After", value: sizeLabel(result.after), tone: "warn" },
              { label: "Change", value: "None — original kept", tone: "warn" },
            ],
            note:
              result.attempted > result.before
                ? `Rebuilding would have produced ${sizeLabel(result.attempted)} — larger than the original — so the original file was kept. Try a lower resolution or image quality.`
                : "This file is already tightly compressed. Try a lower resolution or image quality.",
          },
        };
      }

      return {
        bytes: result.bytes,
        status: "success",
        message: `Reduced by ${pct.toFixed(0)}% (${sizeLabel(result.before)} → ${sizeLabel(result.after)})`,
        report: {
          title: "Compression result",
          stats: [
            { label: "Before", value: sizeLabel(result.before) },
            { label: "After", value: sizeLabel(result.after), tone: "good" },
            { label: "Saved", value: `${sizeLabel(delta)} (${pct.toFixed(0)}%)`, tone: "good" },
          ],
        },
      };
    },
  },
  {
    id: "flatten",
    name: "Flatten",
    description: "Bake form fields and annotations into the page so nothing can be edited or tabbed into.",
    category: "Optimise",
    icon: Layers,
    keywords: ["flatten", "lock", "finalize", "form", "annotations"],
    params: [
      { key: "forms", label: "Flatten form fields", type: "toggle", defaultValue: true },
      { key: "annotations", label: "Remove annotations", type: "toggle", defaultValue: true },
    ],
    run: async (ctx, v) => {
      const result = await flattenPdf(ctx.bytes, {
        forms: bool(v, "forms"),
        removeAnnotations: bool(v, "annotations"),
      });
      return {
        bytes: result.bytes,
        message: "Document flattened",
        report: { title: "Flattened", lines: [result.note || "Nothing to flatten"] },
      };
    },
  },
  {
    id: "remove-blank",
    name: "Remove blank pages",
    description: "Finds and deletes pages with almost no ink — typical of double-sided scans.",
    category: "Optimise",
    icon: FileMinus,
    keywords: ["blank", "empty", "remove", "scan", "cleanup"],
    params: [
      { key: "threshold", label: "Blank threshold", type: "range", defaultValue: 0.002, min: 0.0002, max: 0.01, step: 0.0002, hint: "Higher values remove pages with faint specks." },
      { key: "keepLast", label: "Never remove the last page", type: "toggle", defaultValue: true },
    ],
    run: async (ctx, v) => {
      const result = await removeBlankPages(
        ctx.bytes,
        { threshold: num(v, "threshold", 0.002), ignoreLastPage: bool(v, "keepLast") },
        ctx.onProgress
      );
      if (!result.removed.length) {
        return { message: "No blank pages found", report: { title: "No blank pages", lines: ["Every page contains content."] } };
      }
      return {
        bytes: result.bytes,
        message: `Removed ${result.removed.length} blank page(s)`,
        report: {
          title: "Blank pages removed",
          lines: result.removed.map((i) => `Page ${i + 1}`),
        },
      };
    },
  },
  {
    id: "metadata",
    name: "Edit document properties",
    description: "Rewrite title, author, subject and keywords — the fields that show in file explorers.",
    category: "Inspect",
    icon: FileText,
    keywords: ["metadata", "title", "author", "properties", "subject", "keywords"],
    params: [
      { key: "title", label: "Title", type: "text", defaultValue: "", group: "Details" },
      { key: "author", label: "Author", type: "text", defaultValue: "", group: "Details" },
      { key: "subject", label: "Subject", type: "text", defaultValue: "", group: "Details" },
      { key: "keywords", label: "Keywords", type: "text", defaultValue: "", group: "Details", hint: "Comma separated" },
      { key: "creator", label: "Creator tool", type: "text", defaultValue: "", group: "Origin" },
      { key: "producer", label: "Producer", type: "text", defaultValue: "", group: "Origin" },
    ],
    prepare: async (ctx) => {
      const doc = await loadPdfLib(ctx.bytes);
      return {
        title: doc.getTitle() || "",
        author: doc.getAuthor() || "",
        subject: doc.getSubject() || "",
        keywords: (doc.getKeywords() || "").replace(/\0/g, ""),
        creator: doc.getCreator() || "",
        producer: doc.getProducer() || "",
      };
    },
    run: async (ctx, v) => ({
      bytes: await updateMetadata(ctx.bytes, {
        title: text(v, "title"),
        author: text(v, "author"),
        subject: text(v, "subject"),
        keywords: text(v, "keywords"),
        creator: text(v, "creator"),
        producer: text(v, "producer"),
      }),
      message: "Document properties updated",
    }),
  },
  {
    id: "document-report",
    name: "Document report",
    description: "One-page health check: sizes, metadata, scripts, forms, attachments and encryption.",
    category: "Inspect",
    icon: FileSearch,
    keywords: ["info", "report", "inspect", "security", "audit", "metadata"],
    run: async (ctx) => {
      const report = await documentReport(ctx.bytes);
      return {
        message: "Document report ready",
        report: {
          title: "Document report",
          stats: report.stats,
          lines: report.lines,
        },
      };
    },
  },
  {
    id: "auto-rename",
    name: "Suggest a file name",
    description: "Reads the title and first page to propose a descriptive, date-aware file name.",
    category: "Inspect",
    icon: Type,
    keywords: ["rename", "filename", "title", "auto"],
    run: async (ctx) => {
      const suggested = await suggestFileName(ctx.bytes, ctx.fileName.replace(/\.pdf$/i, ""));
      return {
        rename: `${suggested}.pdf`,
        message: `Suggested name: ${suggested}.pdf`,
        report: {
          title: "Suggested file name",
          lines: [`${suggested}.pdf`],
          note: "Applied to this document. Use Save or Export to keep it.",
        },
      };
    },
  },
  {
    id: "repair",
    name: "Repair PDF",
    description: "Re-parses a damaged document leniently and rewrites a clean, valid file structure.",
    category: "Optimise",
    icon: Wrench,
    keywords: ["repair", "fix", "corrupt", "broken", "recover"],
    run: async (ctx) => {
      const result = await repairPdf(ctx.bytes);
      return {
        bytes: result.bytes,
        message: `Rebuilt ${result.pages} page(s) into a clean structure`,
        report: {
          title: "Repair complete",
          lines: ["Cross-reference table and trailer rebuilt from scratch."],
        },
      };
    },
  },
  {
    id: "redact-search",
    name: "Search & redact",
    description: "Find every occurrence of names, IDs or phrases and destroy them — text included.",
    category: "Security",
    icon: EyeOff,
    keywords: ["redact", "search", "gdpr", "sensitive", "ssn", "scrub"],
    params: [
      { key: "terms", label: "Terms to redact", type: "textarea", defaultValue: "", group: "Find", hint: "Comma or newline separated. Every match is burned out." },
      { key: "caseSensitive", label: "Case sensitive", type: "toggle", defaultValue: false, group: "Find" },
      { key: "wholeWord", label: "Whole words only", type: "toggle", defaultValue: true, group: "Find" },
      { key: "padding", label: "Padding", type: "range", defaultValue: 1, min: 0, max: 12, group: "Find", suffix: "pt" },
      { key: "dpi", label: "Output resolution", type: "select", defaultValue: "200", options: [{ value: "150", label: "150 DPI" }, { value: "200", label: "200 DPI" }, { value: "300", label: "300 DPI" }], group: "Output" },
      { key: "stripMeta", label: "Also strip metadata", type: "toggle", defaultValue: true, group: "Output" },
    ],
    run: async (ctx, v) => {
      const terms = text(v, "terms")
        .split(/[,;\n]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (!terms.length) throw new Error("Enter at least one term to redact");
      ctx.onProgress("Searching the document…");
      const matches = await findTextRegions(ctx.bytes, terms, {
        caseSensitive: bool(v, "caseSensitive"),
        wholeWord: bool(v, "wholeWord"),
        pad: num(v, "padding", 1),
      });
      if (!matches.length) {
        return {
          message: "No matches found",
          report: { title: "Nothing matched", lines: terms.map((t) => `“${t}” — no occurrence`) },
        };
      }
      const result = await redactPdf(
        ctx.bytes,
        matches.map((m) => m.region),
        {
          // Never rasterise below 300 DPI: thinner text can blur into the background and stay legible at a redaction edge.
          dpi: Math.max(300, num(v, "dpi", 300)),
          padding: 0,
          stripMetadata: bool(v, "stripMeta"),
        },
        ctx.onProgress
      );
      if (!result.verified) {
        throw new Error(
          `Redaction incomplete: ${result.remainingChars} character(s) survived. Increase the padding and run again.`
        );
      }
      const perTerm = new Map<string, number>();
      for (const m of matches) perTerm.set(m.text, (perTerm.get(m.text) ?? 0) + 1);
      return {
        bytes: result.bytes,
        message: `Redacted ${matches.length} match(es) across ${result.pages.length} page(s)`,
        report: {
          title: "Redaction complete",
          stats: [
            { label: "Matches burned", value: String(matches.length), tone: "good" },
            { label: "Pages rebuilt", value: ListPages(result.pages) },
            {
              label: "Text verification",
              value: result.verified ? "No text recovered" : `${result.remainingChars} chars remain`,
              tone: result.verified ? "good" : "warn",
            },
          ],
          lines: [...perTerm.entries()].map(([term, count]) => `“${term}” × ${count}`),
          note: result.verified
            ? "Redacted pages are now images: the underlying characters no longer exist in the file."
            : "Some text remained on the redacted pages. Re-run with a wider padding.",
        },
      };
    },
  },
  {
    id: "sanitize",
    name: "Sanitize document",
    description: "Strip scripts, embedded files, form data, annotations and metadata before sharing.",
    category: "Security",
    icon: ShieldCheck,
    keywords: ["sanitize", "clean", "javascript", "metadata", "privacy", "strip"],
    params: [
      { key: "metadata", label: "Erase metadata", type: "toggle", defaultValue: true, group: "Remove" },
      { key: "javascript", label: "JavaScript & auto actions", type: "toggle", defaultValue: true, group: "Remove" },
      { key: "attachments", label: "Embedded files / portfolio", type: "toggle", defaultValue: true, group: "Remove" },
      { key: "annotations", label: "Comments & annotations", type: "toggle", defaultValue: false, group: "Remove" },
      { key: "xmp", label: "XMP metadata stream", type: "toggle", defaultValue: true, group: "Remove" },
      {
        key: "forms",
        label: "Form fields",
        type: "select",
        defaultValue: "keep",
        options: [
          { value: "keep", label: "Keep interactive" },
          { value: "flatten", label: "Flatten into page" },
          { value: "remove", label: "Remove entirely" },
        ],
        group: "Forms",
      },
    ],
    run: async (ctx, v) => {
      const result = await sanitizePdf(ctx.bytes, {
        metadata: bool(v, "metadata"),
        javascript: bool(v, "javascript"),
        attachments: bool(v, "attachments"),
        annotations: bool(v, "annotations"),
        forms: text(v, "forms", "keep") as "keep" | "flatten" | "remove",
        removeXmp: bool(v, "xmp"),
      });
      return {
        bytes: result.bytes,
        message: `Sanitized — ${result.report.length} change(s)`,
        report: {
          title: "Sanitize report",
          lines: result.report.length ? result.report : ["Nothing needed removing"],
        },
      };
    },
  },
  {
    id: "remove-annotations",
    name: "Remove annotations",
    description: "Wipe comments, highlights, stamps and links while keeping the printed page intact.",
    category: "Security",
    icon: Eraser,
    keywords: ["annotations", "comments", "markup", "clean"],
    params: [
      { key: "flatten", label: "Keep form fields visible (flatten first)", type: "toggle", defaultValue: true },
    ],
    run: async (ctx, v) => {
      const result = await removeAnnotations(ctx.bytes, { flattenForms: bool(v, "flatten") });
      return {
        bytes: result.bytes,
        message: result.removed ? `Cleared annotations on ${result.removed} page(s)` : "No annotations found",
      };
    },
  },
  {
    id: "unlock-forms",
    name: "Unlock form fields",
    description: "Clear read-only and required flags so an issued form can be filled in again.",
    category: "Security",
    icon: LockOpen,
    keywords: ["unlock", "form", "readonly", "fill", "editable"],
    run: async (ctx) => {
      const result = await unlockForms(ctx.bytes);
      return {
        bytes: result.bytes,
        message: result.fields ? `Unlocked ${result.fields} field(s)` : "This PDF has no form fields",
      };
    },
  },
  {
    id: "color-adjust",
    name: "Colour & contrast",
    description: "Grayscale, invert or boost contrast across the document — great for photocopied scans.",
    category: "Optimise",
    icon: Palette,
    keywords: ["color", "grayscale", "invert", "contrast", "scan", "bw"],
    params: [
      {
        key: "mode",
        label: "Treatment",
        type: "select",
        defaultValue: "grayscale",
        options: [
          { value: "grayscale", label: "Grayscale" },
          { value: "invert", label: "Invert (dark mode)" },
          { value: "high-contrast", label: "High contrast" },
        ],
        group: "Treatment",
      },
      { key: "amount", label: "Contrast boost", type: "range", defaultValue: 0.35, min: 0, max: 1.5, step: 0.05, group: "Treatment", showIf: (v) => v.mode === "high-contrast" },
      { key: "dpi", label: "Resolution", type: "select", defaultValue: "150", options: [{ value: "120", label: "120 DPI" }, { value: "150", label: "150 DPI" }, { value: "200", label: "200 DPI" }], group: "Output" },
    ],
    run: async (ctx, v) => ({
      bytes: (
        await colorAdjustPdf(
          ctx.bytes,
          {
            mode: text(v, "mode", "grayscale") as "grayscale" | "invert" | "high-contrast",
            amount: num(v, "amount", 0.35),
            dpi: num(v, "dpi", 150),
          },
          ctx.onProgress
        )
      ).bytes,
      message: "Colour treatment applied",
    }),
  },
  {
    id: "extract-images",
    name: "Extract images",
    description: "Pull every embedded photo or scan out of the PDF as a PNG, delivered as a ZIP.",
    category: "Split & Merge",
    icon: Images,
    keywords: ["extract", "images", "photos", "png", "assets"],
    downloads: true,
    run: async (ctx) => {
      const images = await extractPdfImages(ctx.bytes, ctx.onProgress);
      if (!images.length) throw new Error("No embedded images were found in this PDF");
      const zip = new JSZip();
      images.forEach((image) => zip.file(image.name, image.blob));
      const blob = await zip.generateAsync({ type: "blob" });
      return {
        download: {
          blob,
          filename: `${ctx.fileName.replace(/\.pdf$/i, "")}-images.zip`,
        },
        message: `Extracted ${images.length} image(s)`,
      };
    },
  },
  {
    id: "attach",
    name: "Attach a file",
    description: "Embed a contract, receipt or source file inside the PDF so it travels with it.",
    category: "Split & Merge",
    icon: Paperclip,
    keywords: ["attach", "embed", "attachment", "portfolio", "bundle"],
    params: [
      { key: "file", label: "File to attach", type: "file", group: "Attachment" },
      { key: "description", label: "Description", type: "text", defaultValue: "", group: "Attachment" },
    ],
    run: async (ctx, v) => {
      const file = fileArg(v, "file");
      if (!file) throw new Error("Choose a file to attach");
      const bytes = await addAttachmentToPdf(ctx.bytes, {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.type || "application/octet-stream",
        description: text(v, "description") || file.name,
      });
      return { bytes, message: `Attached ${file.name}` };
    },
  },
  {
    id: "split-chunks",
    name: "Split every N pages",
    description: "Break a long document into fixed-size chunks, all delivered as one ZIP.",
    category: "Split & Merge",
    icon: Scissors,
    keywords: ["split", "chunks", "batch", "separate"],
    downloads: true,
    params: [
      { key: "size", label: "Pages per file", type: "number", defaultValue: 10, min: 1, max: 500 },
    ],
    run: async (ctx, v) => {
      const parts = await splitEveryN(ctx.bytes, num(v, "size", 10));
      return {
        download: await zipParts(parts, `${ctx.fileName.replace(/\.pdf$/i, "")}-split.zip`),
        message: `Created ${parts.length} file(s)`,
      };
    },
  },
  {
    id: "split-size",
    name: "Split by file size",
    description: "Keeps every output under a target size — perfect for upload limits.",
    category: "Split & Merge",
    icon: Download,
    keywords: ["split", "size", "limit", "upload", "mb"],
    downloads: true,
    params: [
      { key: "megabytes", label: "Target size", type: "number", defaultValue: 10, min: 1, max: 500, suffix: "MB" },
    ],
    run: async (ctx, v) => {
      const parts = await splitBySize(
        ctx.bytes,
        num(v, "megabytes", 10) * 1024 * 1024,
        ctx.onProgress
      );
      return {
        download: await zipParts(parts, `${ctx.fileName.replace(/\.pdf$/i, "")}-by-size.zip`),
        message: `Created ${parts.length} file(s)`,
      };
    },
  },
  {
    id: "split-bookmarks",
    name: "Split at bookmarks",
    description: "Uses the document outline as chapter boundaries and exports one PDF per section.",
    category: "Split & Merge",
    icon: FileSignature,
    keywords: ["split", "bookmarks", "chapters", "sections", "toc"],
    downloads: true,
    run: async (ctx) => {
      const parts = await splitByBookmarks(ctx.bytes, ctx.outline);
      return {
        download: await zipParts(parts, `${ctx.fileName.replace(/\.pdf$/i, "")}-chapters.zip`),
        message: `Split into ${parts.length} chapter(s)`,
      };
    },
  },
  {
    id: "split-odd-even",
    name: "Split odd / even pages",
    description: "Separates fronts and backs from a duplex scan so you can re-pair them.",
    category: "Split & Merge",
    icon: Rows3,
    keywords: ["split", "odd", "even", "duplex", "scan"],
    downloads: true,
    run: async (ctx) => {
      const parts = await splitOddEven(ctx.bytes);
      return {
        download: await zipParts(parts, `${ctx.fileName.replace(/\.pdf$/i, "")}-odd-even.zip`),
        message: "Separated odd and even pages",
      };
    },
  },
  {
    id: "compare",
    name: "Compare versions",
    description: "See exactly which pages changed between two versions, highlighted in red.",
    category: "Inspect",
    icon: GitCompare,
    keywords: ["compare", "diff", "versions", "changes", "review"],
    params: [{ key: "file", label: "Compare against", type: "file", group: "Version" }],
    run: async (ctx, v) => {
      const file = fileArg(v, "file");
      if (!file) throw new Error("Choose the PDF to compare against");
      const other = new Uint8Array(await file.arrayBuffer());
      const result = await comparePdfs(ctx.bytes, other, ctx.onProgress);
      const changed = result.pages.filter((p) => p.change > 0.0015);
      return {
        message: `${changed.length} of ${result.totalPages} page(s) changed`,
        report: {
          title: "Comparison result",
          stats: [
            { label: "Pages compared", value: String(result.totalPages) },
            {
              label: "Changed pages",
              value: String(changed.length),
              tone: changed.length ? "warn" : "good",
            },
            { label: "Current version", value: `${result.leftPages} pages` },
            { label: "Compared file", value: `${result.rightPages} pages` },
          ],
          lines: changed.length
            ? changed.map((p) => `Page ${p.pageIndex + 1} — ${(p.change * 100).toFixed(1)}% pixels differ`)
            : ["The two documents look identical page for page."],
          images: changed
            .filter((p) => p.overlay)
            .slice(0, 8)
            .map((p) => ({
              src: p.overlay as string,
              label: `Page ${p.pageIndex + 1}`,
            })),
          note: "Red pixels mark changes; the rest of the page is the current version.",
        },
      };
    },
  },
  {
    id: "redact",
    name: "Redact an area",
    description: "Draw boxes over headers, signatures or ID numbers and burn them out.",
    category: "Security",
    icon: EyeOff,
    keywords: ["redact", "black box", "hide", "header", "signature"],
    activateTool: "redact-box",
  },
  {
    id: "bates",
    name: "Bates numbering",
    description: "Legal-grade sequential stamps with prefix, padding and corner placement.",
    category: "Marks & Branding",
    icon: Stamp,
    keywords: ["bates", "legal", "discovery", "numbering"],
    opensDialog: "bates",
  },
  {
    id: "cert-sign",
    name: "Certificate signing",
    description: "Cryptographically sign with a PKCS#12 identity so readers show a trusted signature.",
    category: "Security",
    icon: FileSignature,
    keywords: ["certificate", "sign", "pkcs12", "trust"],
    unavailable: "Needs an OS keychain / server signing engine — not available in the browser build.",
  },
  {
    id: "permissions",
    name: "Password & permissions",
    description: "Encrypt the file with an open password and restrict printing or copying.",
    category: "Security",
    icon: LockOpen,
    keywords: ["password", "encrypt", "permissions", "restrict"],
    unavailable: "PDF encryption is not implemented by this browser library. Run the desktop engine for this.",
  },
  {
    id: "pdfa",
    name: "Convert to PDF/A",
    description: "Archive-grade PDF/A with embedded fonts and validated colour profiles.",
    category: "Optimise",
    icon: ShieldCheck,
    keywords: ["pdfa", "archive", "compliance", "iso"],
    unavailable: "Requires a PDF/A verifier such as veraPDF on a server.",
  },
];

function ListPages(pages: number[]): string {
  const labels = pages.map((p) => p + 1);
  return labels.length > 8
    ? `${labels.slice(0, 8).join(", ")}… (${labels.length})`
    : labels.join(", ");
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  "Organize",
  "Marks & Branding",
  "Optimise",
  "Security",
  "Split & Merge",
  "Inspect",
];

export function getTool(id: string | null | undefined): ToolDef | undefined {
  if (!id) return undefined;
  return TOOLS.find((tool) => tool.id === id);
}

export function defaultValues(tool: ToolDef): ParamValues {
  const values: ParamValues = {};
  for (const param of tool.params ?? []) {
    values[param.key] = param.defaultValue ?? (param.type === "toggle" ? false : "");
  }
  return values;
}

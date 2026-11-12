import { StandardFonts, degrees, rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";

export type Position9 =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const POSITION_LABELS: Array<{ value: Position9; label: string }> = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "middle-left", label: "Middle left" },
  { value: "middle-center", label: "Center" },
  { value: "middle-right", label: "Middle right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

export type FontFamily = "Helvetica" | "TimesRoman" | "Courier";

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = (hex || "#000000").replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const num = parseInt(full.slice(0, 6) || "000000", 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

async function embedFamily(
  doc: PDFDocument,
  family: FontFamily,
  bold: boolean
): Promise<PDFFont> {
  const map: Record<FontFamily, [StandardFonts, StandardFonts]> = {
    Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
    TimesRoman: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
    Courier: [StandardFonts.Courier, StandardFonts.CourierBold],
  };
  return doc.embedFont(bold ? map[family][1] : map[family][0]);
}

function anchor(
  page: PDFPage,
  position: Position9,
  width: number,
  height: number,
  marginX: number,
  marginY: number
): { x: number; y: number } {
  const { width: pw, height: ph } = page.getSize();
  const [v, h] = position.split("-") as ["top" | "middle" | "bottom", "left" | "center" | "right"];

  const x =
    h === "left" ? marginX : h === "center" ? (pw - width) / 2 : pw - width - marginX;
  const y =
    v === "top" ? ph - height - marginY : v === "middle" ? (ph - height) / 2 : marginY;
  return { x, y };
}

export interface PageNumberOptions {
  format: string;
  position: Position9;
  marginX: number;
  marginY: number;
  fontSize: number;
  family: FontFamily;
  bold: boolean;
  color: string;
  opacity: number;
  startNumber: number;
  /** 0-based index of the first page that receives a number */
  startPage: number;
  skipFirstPage: boolean;
  note?: string;
}

/** Replaces {n}, {total} and {p} tokens in a page-number format string. */
export function formatPageNumber(
  format: string,
  index: number,
  total: number,
  startNumber: number
): string {
  const n = startNumber + index;
  return format
    .replace(/\{n\}/gi, String(n))
    .replace(/\{total\}/gi, String(total))
    .replace(/\{p\}/gi, String(index + 1));
}

export const PAGE_NUMBER_PRESETS = [
  { value: "{n}", label: "1" },
  { value: "Page {n}", label: "Page 1" },
  { value: "Page {n} of {total}", label: "Page 1 of 10" },
  { value: "{n} / {total}", label: "1 / 10" },
  { value: "— {n} —", label: "— 1 —" },
  { value: "{n} · Confidential", label: "1 · Confidential" },
];

export async function addPageNumbers(
  bytes: Uint8Array,
  opts: PageNumberOptions,
  targets?: number[]
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const font = await embedFamily(doc, opts.family, opts.bold);
  const pages = doc.getPages();
  const indices =
    targets && targets.length
      ? targets
      : pages.map((_, i) => i).filter((i) => !(opts.skipFirstPage && i === 0) && i >= opts.startPage);
  const color = hexToRgb(opts.color);

  for (const index of indices) {
    const page = pages[index];
    if (!page) continue;
    const label = formatPageNumber(opts.format, index, pages.length, opts.startNumber);
    if (!label.trim()) continue;
    const width = font.widthOfTextAtSize(label, opts.fontSize);
    const { x, y } = anchor(
      page,
      opts.position,
      width,
      opts.fontSize,
      opts.marginX,
      opts.marginY
    );
    page.drawText(label, {
      x,
      y,
      size: opts.fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity: opts.opacity,
    });
  }

  return savePdfBytes(doc);
}

export interface WatermarkOptions {
  kind: "text" | "image";
  text: string;
  fontSize: number;
  family: FontFamily;
  bold: boolean;
  color: string;
  opacity: number;
  rotation: number;
  layout: "single" | "tile" | "header" | "footer";
  position: Position9;
  tileGapX: number;
  tileGapY: number;
  imageScale: number;
  imageBytes?: Uint8Array;
  imageMime?: string;
}

export async function addWatermark(
  bytes: Uint8Array,
  opts: WatermarkOptions,
  targets?: number[]
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const pages = doc.getPages();
  const indices = targets && targets.length ? targets : pages.map((_, i) => i);
  const color = hexToRgb(opts.color);

  let embedded: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (opts.kind === "image" && opts.imageBytes?.length) {
    embedded = opts.imageMime?.includes("png")
      ? await doc.embedPng(opts.imageBytes)
      : await doc.embedJpg(opts.imageBytes);
  }

  const textFont =
    opts.kind === "text" ? await embedFamily(doc, opts.family, opts.bold) : null;

  for (const index of indices) {
    const page = pages[index];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();

    const stamp = (drawX: number, drawY: number, rotate: boolean) => {
      if (opts.kind === "image" && embedded) {
        const w = Math.max(24, pw * opts.imageScale);
        const h = (embedded.height / embedded.width) * w;
        page.drawImage(embedded, {
          x: drawX - w / 2,
          y: drawY - h / 2,
          width: w,
          height: h,
          opacity: opts.opacity,
        });
        return;
      }
      if (!textFont) return;
      const label = opts.text || "CONFIDENTIAL";
      const w = textFont.widthOfTextAtSize(label, opts.fontSize);
      const h = opts.fontSize;
      page.drawText(label, {
        x: drawX - w / 2,
        y: drawY - h / 2,
        size: opts.fontSize,
        font: textFont,
        color: rgb(color.r, color.g, color.b),
        opacity: opts.opacity,
        rotate: degrees(rotate ? opts.rotation : 0),
      });
    };

    if (opts.layout === "tile") {
      const stepX = opts.tileGapX + opts.fontSize * 6;
      const stepY = opts.tileGapY + opts.fontSize * 2;
      for (let y = stepY / 2; y < ph; y += stepY) {
        for (let x = stepX / 2; x < pw; x += stepX) {
          stamp(x, y, true);
        }
      }
      continue;
    }

    if (opts.layout === "header" || opts.layout === "footer") {
      const label = opts.kind === "text" ? opts.text || "CONFIDENTIAL" : "image";
      const w = textFont ? textFont.widthOfTextAtSize(label, opts.fontSize) : pw * opts.imageScale;
      const y =
        opts.layout === "header"
          ? ph - opts.fontSize - 18
          : opts.fontSize + 18;
      stamp((pw - w) / 2 + w / 2, y + opts.fontSize / 2, false);
      continue;
    }

    if (opts.kind === "image") {
      stamp(pw / 2, ph / 2, false);
      continue;
    }

    // Single placement, rotated about its own centre.
    const label = opts.text || "CONFIDENTIAL";
    const w = textFont!.widthOfTextAtSize(label, opts.fontSize);
    const rad = (opts.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let centreX = pw / 2;
    let centreY = ph / 2;
    if (opts.position !== "middle-center") {
      const { x, y } = anchor(page, opts.position, w, opts.fontSize, 36, 36);
      centreX = x + w / 2;
      centreY = y + opts.fontSize / 2;
    }

    // drawText rotates around its own origin, so offset by the rotated half-width/height to keep the label centred.
    page.drawText(label, {
      x: centreX - (w / 2) * cos + (opts.fontSize / 2) * sin,
      y: centreY - (w / 2) * sin - (opts.fontSize / 2) * cos,
      size: opts.fontSize,
      font: textFont!,
      color: rgb(color.r, color.g, color.b),
      opacity: opts.opacity,
      rotate: degrees(opts.rotation),
    });
  }

  return savePdfBytes(doc);
}

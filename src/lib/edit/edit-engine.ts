import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import type { ImageObject, TextEditSession } from "@/lib/types";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";

function parseCssColor(color: string): { r: number; g: number; b: number } {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    return { r: Number(m[1]) / 255, g: Number(m[2]) / 255, b: Number(m[3]) / 255 };
  }
  if (color.startsWith("#") && color.length === 7) {
    return {
      r: parseInt(color.slice(1, 3), 16) / 255,
      g: parseInt(color.slice(3, 5), 16) / 255,
      b: parseInt(color.slice(5, 7), 16) / 255,
    };
  }
  return { r: 0, g: 0, b: 0 };
}

export async function applyTextEdit(
  bytes: Uint8Array,
  session: TextEditSession
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const page = doc.getPage(session.pageIndex);
  const { height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const color = parseCssColor(session.color);

  page.drawRectangle({
    x: session.x,
    y: height - session.y - session.height,
    width: Math.max(session.width, 20),
    height: Math.max(session.height, session.fontSize + 4),
    color: rgb(1, 1, 1),
  });

  const lines = wrapText(session.text, font, session.fontSize, Math.max(session.width, 40));
  let y = height - session.y - session.fontSize;
  for (const line of lines) {
    page.drawText(line, {
      x: session.x,
      y,
      size: session.fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      maxWidth: Math.max(session.width, 40),
      lineHeight: session.fontSize * 1.25,
    });
    y -= session.fontSize * 1.25;
  }

  return savePdfBytes(doc);
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number
): string[] {
  const paragraphs = text.split(/\n/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    lines.push(current || "");
  }
  return lines.length ? lines : [""];
}

export async function replaceImageOnPage(
  bytes: Uint8Array,
  image: ImageObject,
  imageBytes: Uint8Array,
  mime: string
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const page = doc.getPage(image.pageIndex);
  const { height } = page.getSize();
  const embedded = mime.includes("png")
    ? await doc.embedPng(imageBytes)
    : await doc.embedJpg(imageBytes);

  page.drawRectangle({
    x: image.x,
    y: height - image.y - image.height,
    width: image.width,
    height: image.height,
    color: rgb(1, 1, 1),
  });

  page.drawImage(embedded, {
    x: image.x,
    y: height - image.y - image.height,
    width: image.width,
    height: image.height,
    rotate: degrees(image.rotation || 0),
  });

  return savePdfBytes(doc);
}

const BAKED_SIZE_EPSILON = 0.01;

export function imageNeedsBake(image: ImageObject): boolean {
  if (image.removed || image.replaced) return true;
  if (!image.original) return false;
  const o = image.original;
  return (
    Math.abs(o.x - image.x) > BAKED_SIZE_EPSILON ||
    Math.abs(o.y - image.y) > BAKED_SIZE_EPSILON ||
    Math.abs(o.width - image.width) > BAKED_SIZE_EPSILON ||
    Math.abs(o.height - image.height) > BAKED_SIZE_EPSILON
  );
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, mime: match[1] };
  } catch {
    return null;
  }
}

/** Bakes pending image edits (move, resize, replace, delete) into the document so they survive the save. */
export async function applyImageEdits(
  bytes: Uint8Array,
  images: ImageObject[]
): Promise<Uint8Array> {
  const edits = images.filter(imageNeedsBake);
  if (!edits.length) return bytes;

  const doc = await loadPdfLib(bytes);
  for (const image of edits) {
    const page = doc.getPage(image.pageIndex);
    const { height } = page.getSize();
    // Only an image lifted from the file has a region to erase; a freshly inserted one is drawn on top.
    if (image.original) {
      page.drawRectangle({
        x: image.original.x,
        y: height - image.original.y - image.original.height,
        width: image.original.width,
        height: image.original.height,
        color: rgb(1, 1, 1),
      });
    }

    if (image.removed || !image.dataUrl) continue;
    const decoded = decodeDataUrl(image.dataUrl);
    if (!decoded) continue;
    const embedded = decoded.mime.includes("jpeg")
      ? await doc.embedJpg(decoded.bytes)
      : await doc.embedPng(decoded.bytes);
    // pdf-lib rotates around the image's lower-left corner while the editor overlay rotates
    // around its centre, so offset the corner by half the rotated box to align the two.
    const radians = ((image.rotation || 0) * Math.PI) / 180;
    const offsetX =
      (image.width / 2) * Math.cos(radians) - (image.height / 2) * Math.sin(radians);
    const offsetY =
      (image.width / 2) * Math.sin(radians) + (image.height / 2) * Math.cos(radians);
    const centerX = image.x + image.width / 2;
    const centerY = height - image.y - image.height / 2;
    page.drawImage(embedded, {
      x: centerX - offsetX,
      y: centerY - offsetY,
      width: image.width,
      height: image.height,
      rotate: degrees(image.rotation || 0),
    });
  }

  return savePdfBytes(doc);
}

export async function deleteImageRegion(
  bytes: Uint8Array,
  image: ImageObject
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const page = doc.getPage(image.pageIndex);
  const { height } = page.getSize();
  page.drawRectangle({
    x: image.x,
    y: height - image.y - image.height,
    width: image.width,
    height: image.height,
    color: rgb(1, 1, 1),
  });
  return savePdfBytes(doc);
}

export async function drawImageAt(
  bytes: Uint8Array,
  pageIndex: number,
  imageBytes: Uint8Array,
  mime: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const page = doc.getPage(pageIndex);
  const pageHeight = page.getSize().height;
  const embedded = mime.includes("png")
    ? await doc.embedPng(imageBytes)
    : await doc.embedJpg(imageBytes);
  page.drawImage(embedded, {
    x,
    y: pageHeight - y - height,
    width,
    height,
  });
  return savePdfBytes(doc);
}

export async function cropWhiteout(
  bytes: Uint8Array,
  pageIndex: number,
  regions: Array<{ x: number; y: number; width: number; height: number }>
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const page = doc.getPage(pageIndex);
  const { height } = page.getSize();
  for (const r of regions) {
    page.drawRectangle({
      x: r.x,
      y: height - r.y - r.height,
      width: r.width,
      height: r.height,
      color: rgb(1, 1, 1),
    });
  }
  return savePdfBytes(doc);
}

export async function extractPageAsPngDataUrl(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export canvas"));
    }, "image/png");
  });
}

export async function reloadAsBytes(doc: PDFDocument) {
  return savePdfBytes(doc);
}

import { PDFDocument, rgb, degrees } from "pdf-lib";
import { isRtl } from "@/lib/text/bidi";
import type { ImageObject, TextEditSession, TextObject } from "@/lib/types";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";
import { embedAppFont, type EmbeddedFontFamily } from "@/lib/text/embedded-fonts";

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

/** WinAnsi covers Latin-1 plus these CP1252 codepoints, so pdf-lib can encode them. */
const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/**
 * The PDF standard fonts only cover WinAnsi, so any other script (Cyrillic, CJK,
 * Arabic, Indic…) would bake as tofu. Those blocks are rasterised through the
 * browser's own local fonts instead of shipping megabytes of Noto faces; common
 * typography (curly quotes, dashes, €) stays vector and therefore searchable.
 */
function needsRasterText(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0xff && !WIN_ANSI_EXTRAS.has(code)) return true;
  }
  return false;
}

const RASTER_TEXT_SCALE = 4;

/** Draws text as a transparent PNG using locally available system fonts. */
export async function drawRasterTextBox(
  doc: PDFDocument,
  pageIndex: number,
  session: DrawableText
): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return false;

  const boxWidth = Math.max(session.width, 40);
  const fontSpec = `${session.bold ? "700 " : "400 "}${session.fontSize}px ${
    session.fontFamily || "sans-serif"
  }`;
  measure.font = fontSpec;

  const lines = layoutLines(
    session,
    { widthOfTextAtSize: (text) => measure.measureText(text).width },
    session.fontSize,
    boxWidth
  );
  const lineHeight = session.fontSize * (session.lineHeight ?? 1.25);
  // Matches the on-canvas overlay padding (`2px 4px`) so text does not shift on save.
  const padX = 4;
  const padY = 2;
  const drawHeight = Math.max(session.height, lines.length * lineHeight);

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((boxWidth + padX * 2) * RASTER_TEXT_SCALE);
  canvas.height = Math.ceil((drawHeight + padY * 2) * RASTER_TEXT_SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.scale(RASTER_TEXT_SCALE, RASTER_TEXT_SCALE);
  ctx.font = fontSpec;
  ctx.fillStyle = session.color;
  ctx.textBaseline = "top";

  const isRtlText = isRtl(session.text);
  ctx.direction = isRtlText ? "rtl" : "ltr";
  ctx.textAlign = isRtlText ? "right" : "left";
  const effectiveWidth = boxWidth + padX * 2;
  const startX = isRtlText ? effectiveWidth - padX : padX;
  lines.forEach((line, index) => {
    // The width argument compresses a preserved source line instead of wrapping it.
    ctx.fillText(line, startX, padY + index * lineHeight, boxWidth);
  });

  // Rules are canvas-drawn here; the vector path cannot be reused for this block.
  if (session.underline || session.strikethrough) {
    ctx.strokeStyle = session.color;
    ctx.lineWidth = Math.max(0.6, session.fontSize * 0.06);
    lines.forEach((line, index) => {
      const lineWidth = Math.min(measure.measureText(line).width, boxWidth);
      if (lineWidth <= 0) return;
      const left = isRtlText ? startX - lineWidth : startX;
      const top = padY + index * lineHeight;
      if (session.underline) {
        const y = top + session.fontSize * 0.98;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + lineWidth, y);
        ctx.stroke();
      }
      if (session.strikethrough) {
        const y = top + session.fontSize * 0.58;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + lineWidth, y);
        ctx.stroke();
      }
    });
  }

  const decoded = decodeDataUrl(canvas.toDataURL("image/png"));
  if (!decoded) return false;

  const page = doc.getPage(pageIndex);
  const { height } = page.getSize();
  const image = await doc.embedPng(decoded.bytes);
  const width = canvas.width / RASTER_TEXT_SCALE;
  const imageHeight = canvas.height / RASTER_TEXT_SCALE;
  const angle = session.rotation ?? 0;
  const radians = (angle * Math.PI) / 180;
  const centerX = session.x + width / 2;
  const centerY = height - session.y - imageHeight / 2;
  const offsetX = (width / 2) * Math.cos(radians) - (imageHeight / 2) * Math.sin(radians);
  const offsetY = (width / 2) * Math.sin(radians) + (imageHeight / 2) * Math.cos(radians);

  page.drawImage(image, {
    x: centerX - offsetX,
    y: centerY - offsetY,
    width,
    height: imageHeight,
    rotate: degrees(angle),
  });
  return true;
}

// Classify the editor CSS stack into a Liberation family kind; embedAppFont
// then resolves the concrete OFL face (serif/mono no longer collapse to sans).
function pickEmbeddedFamily(family: string): EmbeddedFontFamily {
  const f = (family || "").toLowerCase();
  if (f.includes("courier") || f.includes("mono") || f.includes("liberation mono")) {
    return "mono";
  }
  if (
    f.includes("times") ||
    f.includes("georgia") ||
    f.includes("liberation serif") ||
    (f.includes("serif") && !f.includes("sans"))
  ) {
    return "serif";
  }
  return "sans";
}

/** Fields shared by an in-progress text session and a placed text object. */
type DrawableText = Pick<
  TextEditSession,
  | "text"
  | "x"
  | "y"
  | "width"
  | "height"
  | "fontSize"
  | "fontFamily"
  | "sourceFontName"
  | "color"
  | "lineHeight"
  | "bold"
  | "underline"
  | "strikethrough"
  | "rotation"
  | "preserveLines"
>;

/** Draws one text block into an open document, rotated around the box centre. */
async function drawTextBox(
  doc: PDFDocument,
  pageIndex: number,
  session: DrawableText & { eraseUnderlay?: boolean }
) {
  const page = doc.getPage(pageIndex);
  const { height } = page.getSize();
  const font = await embedAppFont(doc, {
    family: pickEmbeddedFamily(session.fontFamily),
    // Prefer the source document face; the CSS stack is already substituted and
    // would hide an exact name-map or user-font match.
    name: session.sourceFontName ?? session.fontFamily,
    bold: session.bold,
    text: session.text,
  });
  const color = parseCssColor(session.color);
  const lineHeight = session.fontSize * (session.lineHeight ?? 1.25);
  // Honour the source box exactly; a 40pt floor re-wrapped narrow columns and pushed
  // their lines into the block below.
  const boxWidth = Math.max(session.width, Math.max(4, session.fontSize * 0.5));
  const angle = session.rotation ?? 0;
  const radians = (angle * Math.PI) / 180;
  const cx = session.x + session.width / 2;
  const cy = height - session.y - session.height / 2;

  // pdf-lib rotates around the drawing origin, so rotate the anchors around the box centre
  // to make the whole block spin in place.
  const spin = (x: number, y: number): [number, number] => {
    if (!angle) return [x, y];
    const dx = x - cx;
    const dy = y - cy;
    return [
      cx + dx * Math.cos(radians) - dy * Math.sin(radians),
      cy + dx * Math.sin(radians) + dy * Math.cos(radians),
    ];
  };

  if (session.eraseUnderlay) {
    const [rx, ry] = spin(session.x, height - session.y - session.height);
    page.drawRectangle({
      x: rx,
      y: ry,
      width: Math.max(session.width, 4),
      height: Math.max(session.height, session.fontSize * 1.2),
      color: rgb(1, 1, 1),
      rotate: degrees(angle),
    });
  }

  if (needsRasterText(session.text) && (await drawRasterTextBox(doc, pageIndex, session))) {
    return;
  }

  const lines = layoutLines(session, font, session.fontSize, boxWidth);
  let baseline = height - session.y - session.fontSize;
  for (const line of lines) {
    const [x, y] = spin(session.x, baseline);
    page.drawText(line, {
      x,
      y,
      size: session.fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      // No maxWidth/lineHeight here: pdf-lib wraps those itself. Lines were already
      // wrapped (or preserved from the source), so letting pdf-lib re-wrap emitted
      // extra lines at the same leading and stacked them into the next block.
      rotate: degrees(angle),
    });

    // Underline / strikethrough are drawn as rules under the same rotation as the glyphs.
    const ruleWidth = Math.min(
      font.widthOfTextAtSize(line, session.fontSize),
      boxWidth
    );
    if (ruleWidth > 0 && (session.underline || session.strikethrough)) {
      const thickness = Math.max(0.6, session.fontSize * 0.06);
      const rules: Array<{ dy: number; thickness: number }> = [];
      if (session.underline) rules.push({ dy: -session.fontSize * 0.14, thickness });
      if (session.strikethrough) {
        rules.push({ dy: session.fontSize * 0.32, thickness: thickness * 1.2 });
      }
      // pdf-lib's drawLine has no rotate option, so place both ends in rotated space:
      // offset downwards by dy in text space, then run along the rotated baseline.
      for (const rule of rules) {
        const startX = x - rule.dy * Math.sin(radians);
        const startY = y + rule.dy * Math.cos(radians);
        page.drawLine({
          start: { x: startX, y: startY },
          end: {
            x: startX + ruleWidth * Math.cos(radians),
            y: startY + ruleWidth * Math.sin(radians),
          },
          thickness: rule.thickness,
          color: rgb(color.r, color.g, color.b),
        });
      }
    }
    baseline -= lineHeight;
  }
}

export async function applyTextEdit(
  bytes: Uint8Array,
  session: TextEditSession
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  await drawTextBox(doc, session.pageIndex, session);
  return savePdfBytes(doc);
}

/** Bakes placed text boxes (which live as overlays until save/export). */
export async function applyTextObjects(
  bytes: Uint8Array,
  objects: TextObject[]
): Promise<Uint8Array> {
  if (!objects.length) return bytes;
  const doc = await loadPdfLib(bytes);
  for (const object of objects) {
    await drawTextBox(doc, object.pageIndex, object);
  }
  return savePdfBytes(doc);
}

/**
 * Lines are wrapped for new boxes, but text lifted from the PDF keeps its original
 * breaks. The substitute face has different advances; re-wrapping could add a line
 * that spills into the paragraph below.
 */
function layoutLines(
  session: Pick<DrawableText, "text" | "preserveLines">,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number
): string[] {
  if (session.preserveLines) return session.text.split(/\n/);
  return wrapText(session.text, font, size, maxWidth);
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
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        current = test;
        continue;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      // A single unbroken token (CJK, URLs) still has to wrap, or it is clipped.
      let chunk = "";
      for (const char of Array.from(word)) {
        if (chunk && font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
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

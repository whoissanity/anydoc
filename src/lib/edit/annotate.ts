import { BlendMode, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import type { AnnotationItem, StickyNoteItem } from "@/lib/types";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";

/** Burns review markup into the PDF content stream; an overlay is only a preview and would vanish on save. */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = (hex || "#000000").replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const num = parseInt(full.slice(0, 6) || "000000", 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

function wrap(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

/** Parses a captured "M x y L x y" ink path into PDF line segments. */
function drawInkPath(
  page: PDFPage,
  pathData: string,
  captureScale: number,
  pageHeight: number,
  color: { r: number; g: number; b: number },
  opacity: number
) {
  const tokens = pathData.trim().split(/\s+/);
  const scale = captureScale || 1;
  let previous: { x: number; y: number } | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const command = tokens[i];
    if (command !== "M" && command !== "L") continue;
    const px = Number(tokens[i + 1]);
    const py = Number(tokens[i + 2]);
    i += 2;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

    const point = { x: px / scale, y: pageHeight - py / scale };
    if (command === "L" && previous) {
      page.drawLine({
        start: previous,
        end: point,
        thickness: 1.6,
        color: rgb(color.r, color.g, color.b),
        opacity,
      });
    }
    previous = point;
  }
}

export async function applyAnnotationsToPdf(
  bytes: Uint8Array,
  annotations: AnnotationItem[],
  notes: StickyNoteItem[],
  opts: { opacity: number }
): Promise<Uint8Array> {
  if (!annotations.length && !notes.length) return bytes;

  const doc = await loadPdfLib(bytes);
  const pages = doc.getPages();
  const noteFont = await doc.embedFont(StandardFonts.Helvetica);
  const noteBold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const annot of annotations) {
    const page = pages[annot.pageIndex];
    if (!page) continue;
    const { height } = page.getSize();
    const color = hexToRgb(annot.color);

    if (annot.type === "highlight") {
      for (const rect of annot.rects) {
        page.drawRectangle({
          x: rect.x,
          y: height - rect.y - rect.height,
          width: Math.max(0.5, rect.width),
          height: Math.max(0.5, rect.height),
          color: rgb(color.r, color.g, color.b),
          opacity: annot.opacity ?? opts.opacity,
          blendMode: BlendMode.Multiply,
        });
      }
      continue;
    }

    if (annot.type === "underline" || annot.type === "strikethrough") {
      for (const rect of annot.rects) {
        const baseline = rect.lineY ?? rect.y + rect.height;
        const top =
          annot.type === "underline"
            ? baseline - 1
            : baseline - rect.height * 0.32;
        page.drawRectangle({
          x: rect.x,
          y: height - top,
          width: Math.max(0.5, rect.width),
          height: annot.type === "underline" ? 1.2 : 1.4,
          color: rgb(color.r, color.g, color.b),
        });
      }
      continue;
    }

    if (annot.type === "draw") {
      const pathData = (annot as AnnotationItem & { pathData?: string }).pathData;
      if (pathData) {
        drawInkPath(page, pathData, annot.scale ?? 1, height, color, opts.opacity);
      }
    }
  }

  for (const note of notes) {
    const page = pages[note.pageIndex];
    if (!page) continue;
    const { width, height } = page.getSize();
    const scale = note.scale ?? 1;
    const x = note.x / scale;
    const y = note.y / scale;
    const boxW = Math.min(210, width - x - 12);
    if (boxW < 60) continue;

    const lines = wrap(note.text || "Note", noteFont, 8, boxW - 16);
    const boxH = 26 + lines.length * 10;
    page.drawRectangle({
      x,
      y: height - y - boxH,
      width: boxW,
      height: boxH,
      color: rgb(1, 0.93, 0.6),
      opacity: 0.95,
      borderColor: rgb(0.85, 0.68, 0.2),
      borderWidth: 0.8,
    });
    page.drawText(`${note.author} · ${note.date}`, {
      x: x + 8,
      y: height - y - 14,
      size: 7,
      font: noteBold,
      color: rgb(0.35, 0.26, 0.05),
    });
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: x + 8,
        y: height - y - 25 - index * 10,
        size: 8,
        font: noteFont,
        color: rgb(0.15, 0.12, 0.03),
      });
    });
  }

  return savePdfBytes(doc);
}

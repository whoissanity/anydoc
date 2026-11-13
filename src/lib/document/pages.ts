import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PageSizes,
  type PDFPage,
} from "pdf-lib";
import type { BatesOptions } from "@/lib/types";

export async function loadPdfLib(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

/** Named paper sizes in PDF points. */
export const PAGE_PRESETS: Record<string, [number, number]> = {
  a3: [841.89, 1190.55],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
  tabloid: [792, 1224],
};

/** Parses "1-3, 5, 8-" into zero-based page indices clamped to the doc; empty or unparseable returns every page. */
export function parsePageRange(input: string, pageCount: number): number[] {
  const text = (input || "").trim();
  const all = Array.from({ length: pageCount }, (_, i) => i);
  if (!text) return all;

  const found = new Set<number>();
  for (const chunk of text.split(/[,;\s]+/).filter(Boolean)) {
    const match = chunk.match(/^(\d+)?\s*(?:-|–|to)?\s*(\d+)?$/i);
    if (!match) continue;
    const start = match[1] ? Number(match[1]) : 1;
    const end = match[2] ? Number(match[2]) : start;
    for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
      if (p >= 1 && p <= pageCount) found.add(p - 1);
    }
  }

  if (!found.size) return all;
  return [...found].sort((a, b) => a - b);
}

export function describeRange(indices: number[]): string {
  if (!indices.length) return "none";
  const pages = indices.map((i) => i + 1);
  return pages.length > 6
    ? `${pages.slice(0, 6).join(", ")}… (${pages.length} pages)`
    : pages.join(", ");
}

export async function savePdfBytes(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

/** Blanks title, author, subject, keywords, creator, producer and both dates; shared by the scrub, sanitize and redact paths. */
export function stripMetadata(doc: PDFDocument): void {
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setCreator("");
  doc.setProducer("");
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
}

export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const src = await loadPdfLib(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((p) => out.addPage(p));
  return savePdfBytes(out);
}

export async function deletePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const sorted = [...indices].sort((a, b) => b - a);
  for (const i of sorted) {
    if (i >= 0 && i < doc.getPageCount()) doc.removePage(i);
  }
  if (doc.getPageCount() === 0) {
    doc.addPage(PageSizes.Letter);
  }
  return savePdfBytes(doc);
}

export async function insertBlankPage(
  bytes: Uint8Array,
  atIndex: number,
  size: [number, number] = PageSizes.Letter
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const page = doc.insertPage(Math.min(atIndex, doc.getPageCount()), size);
  page.setSize(size[0], size[1]);
  return savePdfBytes(doc);
}

export async function insertPagesFromFile(
  targetBytes: Uint8Array,
  sourceBytes: Uint8Array,
  atIndex: number
): Promise<Uint8Array> {
  const target = await loadPdfLib(targetBytes);
  const source = await loadPdfLib(sourceBytes);
  const copied = await target.copyPages(source, source.getPageIndices());
  let insertAt = Math.min(Math.max(atIndex, 0), target.getPageCount());
  for (const page of copied) {
    target.insertPage(insertAt, page);
    insertAt += 1;
  }
  return savePdfBytes(target);
}

export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await loadPdfLib(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return savePdfBytes(out);
}

export async function splitPdf(
  bytes: Uint8Array
): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const src = await loadPdfLib(bytes);
  const results: Array<{ name: string; bytes: Uint8Array }> = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(src, [i]);
    out.addPage(page);
    results.push({ name: `page-${i + 1}.pdf`, bytes: await savePdfBytes(out) });
  }
  return results;
}

export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of files) {
    const src = await loadPdfLib(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return savePdfBytes(out);
}

function batesText(opts: BatesOptions, pageNumber: number): string {
  const n = opts.start + pageNumber - 1;
  const padded = String(n).padStart(opts.padding, "0");
  return `${opts.prefix}${padded}${opts.suffix}`;
}

function stampPosition(
  page: PDFPage,
  position: BatesOptions["position"],
  fontSize: number
): { x: number; y: number } {
  const { width, height } = page.getSize();
  const margin = 24;
  switch (position) {
    case "top-left":
      return { x: margin, y: height - margin - fontSize };
    case "top-right":
      return { x: width - margin - 120, y: height - margin - fontSize };
    case "bottom-left":
      return { x: margin, y: margin };
    case "bottom-right":
    default:
      return { x: width - margin - 120, y: margin };
  }
}

export async function applyBatesNumbering(
  bytes: Uint8Array,
  opts: BatesOptions
): Promise<Uint8Array> {
  if (!opts.enabled) return bytes;
  const doc = await loadPdfLib(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const text = batesText(opts, i + 1);
    const pos = stampPosition(page, opts.position, opts.fontSize);
    page.drawText(text, {
      x: pos.x,
      y: pos.y,
      size: opts.fontSize,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
  });
  return savePdfBytes(doc);
}

export async function rotatePage(
  bytes: Uint8Array,
  pageIndex: number,
  angle: 90 | 180 | 270
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const page = doc.getPage(pageIndex);
  const current = page.getRotation().angle;
  page.setRotation(degrees((current + angle) % 360));
  return savePdfBytes(doc);
}

export async function createPdfFromImages(
  images: Array<{ bytes: Uint8Array; mime: string }>
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const img of images) {
    let embedded;
    if (img.mime.includes("png")) {
      embedded = await doc.embedPng(img.bytes);
    } else {
      embedded = await doc.embedJpg(img.bytes);
    }
    const page = doc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
  }
  return savePdfBytes(doc);
}

export async function createPdfFromText(text: string, title = "Document"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const margin = 50;
  const fontSize = 12;
  const lineHeight = 16;
  const pageWidth = PageSizes.Letter[0];
  const pageHeight = PageSizes.Letter[1];
  const maxWidth = pageWidth - margin * 2;

  const words = text.replace(/\r\n/g, "\n").split(/(\s+)/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word === "\n") {
      lines.push(current);
      current = "";
      continue;
    }
    const test = current + word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word.trimStart();
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  let page = doc.addPage(PageSizes.Letter);
  let y = pageHeight - margin;
  for (const line of lines) {
    if (y < margin) {
      page = doc.addPage(PageSizes.Letter);
      y = pageHeight - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }
  return savePdfBytes(doc);
}

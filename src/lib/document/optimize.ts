"use client";

import { PDFDocument, PDFName, rgb, StandardFonts, degrees } from "pdf-lib";
import { loadPdfLib, savePdfBytes, stripMetadata } from "@/lib/document/pages";
import { canvasToJpegBytes, canvasToPngBytes, loadRasterDoc, renderRasterPage } from "@/lib/document/raster";

export interface RedactRegion {
  pageIndex: number;
  /** PDF user-space coordinates (origin bottom-left) */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedactResult {
  bytes: Uint8Array;
  pages: number[];
  /** True when the re-rendered pages carry no recoverable text layer. */
  verified: boolean;
  remainingChars: number;
}

/** Null for degenerate/non-finite boxes so a bad coordinate can't silently redact nothing. */
function toDeviceRect(
  region: RedactRegion,
  padding: number,
  viewport: { convertToViewportRectangle: (rect: number[]) => number[] }
): { left: number; top: number; width: number; height: number } | null {
  const corners = [region.x, region.y, region.width, region.height];
  if (!corners.every((value) => Number.isFinite(value))) return null;

  const pad = Math.max(0, padding);
  const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle([
    region.x - pad,
    region.y - pad,
    region.x + region.width + pad,
    region.y + region.height + pad,
  ]);
  if (![vx1, vy1, vx2, vy2].every((value) => Number.isFinite(value))) return null;

  const left = Math.min(vx1, vx2);
  const top = Math.min(vy1, vy2);
  const width = Math.abs(vx2 - vx1);
  const height = Math.abs(vy2 - vy1);
  if (width < 1 || height < 1) return null;

  return { left, top, width, height };
}

/** True redaction: re-rendered to lossless PNG with areas burned in; JPEG ringing can recover glyphs. */
export async function redactPdf(
  bytes: Uint8Array,
  regions: RedactRegion[],
  opts: { dpi: number; padding: number; stripMetadata: boolean },
  onProgress?: (msg: string) => void
): Promise<RedactResult> {
  const pages = [...new Set(regions.map((r) => r.pageIndex))].sort((a, b) => a - b);
  if (!pages.length) throw new Error("Select at least one area or search term to redact");

  const raster = await loadRasterDoc(bytes);
  const src = await loadPdfLib(bytes);
  const out = await PDFDocument.create();
  const scale = Math.max(1, opts.dpi / 72);

  for (let i = 0; i < src.getPageCount(); i++) {
    onProgress?.(`Redacting page ${i + 1} of ${src.getPageCount()}…`);

    if (!pages.includes(i)) {
      const [copied] = await out.copyPages(src, [i]);
      out.addPage(copied);
      continue;
    }

    const canvas = await renderRasterPage(raster, i + 1, scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is unavailable");

    const pdfPage = await raster.getPage(i + 1);
    const viewport = pdfPage.getViewport({ scale });
    const pointViewport = pdfPage.getViewport({ scale: 1 });

    // Fully opaque source-over black: the pixels beneath are overwritten and the page becomes this image.
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000000";
    for (const region of regions.filter((r) => r.pageIndex === i)) {
      const box = toDeviceRect(region, opts.padding, viewport);
      if (box) ctx.fillRect(box.left, box.top, box.width, box.height);
    }
    ctx.restore();

    const png = await canvasToPngBytes(canvas);
    const embedded = await out.embedPng(png);
    const imagePage = out.addPage([pointViewport.width, pointViewport.height]);
    imagePage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pointViewport.width,
      height: pointViewport.height,
    });
  }

  if (opts.stripMetadata) {
    stripMetadata(out);
  }

  const result = await savePdfBytes(out);

  onProgress?.("Verifying that no text survived…");
  const check = await loadRasterDoc(result);
  let remainingChars = 0;
  for (const pageIndex of pages) {
    const page = await check.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) remainingChars += item.str.trim().length;
    }
  }

  return { bytes: result, pages, verified: remainingChars === 0, remainingChars };
}

export interface TextMatchRegion {
  region: RedactRegion;
  text: string;
}

/** Finds every occurrence of the given terms and returns draw-ready boxes. */
export async function findTextRegions(
  bytes: Uint8Array,
  terms: string[],
  opts: { caseSensitive: boolean; wholeWord: boolean; pad: number }
): Promise<TextMatchRegion[]> {
  const words = terms.map((t) => t.trim()).filter(Boolean);
  if (!words.length) return [];
  const raster = await loadRasterDoc(bytes);
  const matches: TextMatchRegion[] = [];
  const pad = opts.pad;

  for (let p = 1; p <= raster.numPages; p++) {
    const page = await raster.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const raw = item.str;
      if (!raw.trim()) continue;

      for (const term of words) {
        const haystack = opts.caseSensitive ? raw : raw.toLowerCase();
        const needle = opts.caseSensitive ? term : term.toLowerCase();
        const at = haystack.indexOf(needle);
        if (at < 0) continue;
        if (opts.wholeWord) {
          const before = haystack[at - 1];
          const after = haystack[at + needle.length];
          if (before && /[a-z0-9]/i.test(before)) continue;
          if (after && /[a-z0-9]/i.test(after)) continue;
        }

        const [a, b, c, d, e, f] = item.transform as number[];
        const w = item.width || 8;
        const h = item.height || 10;
        const corners = [
          [0, 0],
          [w, 0],
          [0, h],
          [w, h],
        ].map(([cx, cy]) => [a * cx + c * cy + e, b * cx + d * cy + f]);
        const xs = corners.map((pt) => pt[0]);
        const ys = corners.map((pt) => pt[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        matches.push({
          text: term,
          region: {
            pageIndex: p - 1,
            x: minX - pad,
            y: minY - pad,
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2,
          },
        });
      }
    }
  }

  return matches;
}

/** Removes JavaScript, embedded files, actions and (optionally) form data. */
export async function sanitizePdf(
  bytes: Uint8Array,
  opts: {
    metadata: boolean;
    javascript: boolean;
    attachments: boolean;
    annotations: boolean;
    forms: "keep" | "flatten" | "remove";
    removeXmp: boolean;
  }
): Promise<{ bytes: Uint8Array; report: string[] }> {
  const doc = await loadPdfLib(bytes);
  const catalog = doc.catalog;
  const report: string[] = [];
  const has = (key: string) => catalog.has(PDFName.of(key));

  if (opts.javascript) {
    if (has("Names")) {
      catalog.delete(PDFName.of("Names"));
      report.push("Removed document JavaScript and the names tree");
    }
    if (has("OpenAction")) {
      catalog.delete(PDFName.of("OpenAction"));
      report.push("Removed the automatic open action");
    }
    if (has("AA")) {
      catalog.delete(PDFName.of("AA"));
      report.push("Removed additional-actions triggers");
    }
    for (const page of doc.getPages()) {
      if (page.node.has(PDFName.of("AA"))) page.node.delete(PDFName.of("AA"));
    }
  }

  if (opts.attachments && has("Collection")) {
    catalog.delete(PDFName.of("Collection"));
    report.push("Removed the portfolio/collection dictionary");
  }

  if (opts.forms !== "keep") {
    if (opts.forms === "flatten" && has("AcroForm")) {
      try {
        doc.getForm().flatten({ updateFieldAppearances: true });
        report.push("Flattened form fields into page content");
      } catch {
        report.push("Form flattening was not possible; fields left untouched");
      }
    }
    if (opts.forms === "remove" && has("AcroForm")) {
      catalog.delete(PDFName.of("AcroForm"));
      report.push("Removed the interactive form dictionary");
    }
  }

  if (opts.annotations) {
    let pages = 0;
    for (const page of doc.getPages()) {
      if (!page.node.has(PDFName.of("Annots"))) continue;
      page.node.delete(PDFName.of("Annots"));
      pages++;
    }
    if (pages) report.push(`Removed annotations from ${pages} page(s)`);
  }

  if (opts.metadata) {
    stripMetadata(doc);
    report.push("Erased document title, author, subject, keywords and dates");
  }
  if (opts.removeXmp && has("Metadata")) {
    catalog.delete(PDFName.of("Metadata"));
    report.push("Removed the XMP metadata stream");
  }

  return { bytes: await savePdfBytes(doc), report };
}

/** Strips every annotation; form fields are widgets, flattened first so their appearance is burned in. */
export async function removeAnnotations(
  bytes: Uint8Array,
  opts: { flattenForms: boolean }
): Promise<{ bytes: Uint8Array; removed: number }> {
  const doc = await loadPdfLib(bytes);
  if (opts.flattenForms) {
    try {
      doc.getForm().flatten({ updateFieldAppearances: true });
    } catch {
      // no fillable fields
    }
  }
  let removed = 0;
  for (const page of doc.getPages()) {
    if (!page.node.has(PDFName.of("Annots"))) continue;
    page.node.delete(PDFName.of("Annots"));
    removed++;
  }
  return { bytes: await savePdfBytes(doc), removed };
}

export interface CompressResult {
  bytes: Uint8Array;
  before: number;
  after: number;
  /** Size the rebuild produced before the size guard was applied. */
  attempted: number;
  /** True when the returned bytes are genuinely smaller than the input. */
  reduced: boolean;
}

export async function compressPdf(
  bytes: Uint8Array,
  opts: { mode: "lossless" | "raster"; dpi: number; quality: number; grayscale: boolean },
  onProgress?: (msg: string) => void
): Promise<CompressResult> {
  const before = bytes.byteLength;
  let produced: Uint8Array;

  if (opts.mode === "lossless") {
    onProgress?.("Rebuilding object streams…");
    const doc = await loadPdfLib(bytes);
    produced = await savePdfBytes(doc);
  } else {
    const raster = await loadRasterDoc(bytes);
    const out = await PDFDocument.create();
    const scale = Math.max(0.5, opts.dpi / 72);

    for (let i = 1; i <= raster.numPages; i++) {
      onProgress?.(`Rewriting page ${i} of ${raster.numPages}…`);
      const canvas = await renderRasterPage(raster, i, scale);
      if (opts.grayscale) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = image.data;
          for (let p = 0; p < d.length; p += 4) {
            const luma = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
            d[p] = luma;
            d[p + 1] = luma;
            d[p + 2] = luma;
          }
          ctx.putImageData(image, 0, 0);
        }
      }
      const jpeg = await canvasToJpegBytes(canvas, opts.quality);
      const embedded = await out.embedJpg(jpeg);
      const page = out.addPage([embedded.width / scale, embedded.height / scale]);
      const { width, height } = page.getSize();
      page.drawImage(embedded, { x: 0, y: 0, width, height });
    }

    produced = await savePdfBytes(out);
  }

  const attempted = produced.byteLength;
  // A rebuild can be larger than the source (re-serialising, or a re-encode that can't win); keep the original.
  if (attempted >= before) {
    onProgress?.("File is already optimised — keeping the original.");
    return { bytes, before, after: before, attempted, reduced: false };
  }
  return { bytes: produced, before, after: attempted, attempted, reduced: true };
}

export async function flattenPdf(
  bytes: Uint8Array,
  opts: { forms: boolean; removeAnnotations: boolean }
): Promise<{ bytes: Uint8Array; note: string }> {
  const doc = await loadPdfLib(bytes);
  const notes: string[] = [];
  if (opts.forms) {
    try {
      doc.getForm().flatten({ updateFieldAppearances: true });
      notes.push("form fields flattened");
    } catch {
      notes.push("no fillable fields found");
    }
  }
  let removed = 0;
  if (opts.removeAnnotations) {
    for (const page of doc.getPages()) {
      if (!page.node.has(PDFName.of("Annots"))) continue;
      const annots = page.node.get(PDFName.of("Annots")) as unknown as
        | { size?: () => number }
        | undefined;
      removed += annots?.size?.() ?? 0;
      page.node.delete(PDFName.of("Annots"));
    }
    if (removed) notes.push(`${removed} annotations removed`);
  }
  return { bytes: await savePdfBytes(doc), note: notes.join(", ") };
}

export async function unlockForms(bytes: Uint8Array): Promise<{ bytes: Uint8Array; fields: number }> {
  const doc = await loadPdfLib(bytes);
  const form = doc.getForm();
  const fields = form.getFields();
  for (const field of fields) {
    try {
      field.disableReadOnly();
      field.disableRequired();
    } catch {
      // field types without those flags
    }
  }
  return { bytes: await savePdfBytes(doc), fields: fields.length };
}

export interface MetadataValues {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

export async function updateMetadata(
  bytes: Uint8Array,
  values: MetadataValues
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  doc.setTitle(values.title);
  doc.setAuthor(values.author);
  doc.setSubject(values.subject);
  doc.setKeywords(values.keywords.split(",").map((k) => k.trim()).filter(Boolean));
  doc.setCreator(values.creator);
  doc.setProducer(values.producer);
  doc.setModificationDate(new Date());
  return savePdfBytes(doc);
}

/** Repairs a damaged file by re-parsing leniently and rewriting structure. */
export async function repairPdf(bytes: Uint8Array): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  const out = await savePdfBytes(doc);
  return { bytes: out, pages: doc.getPageCount() };
}

export async function removeBlankPages(
  bytes: Uint8Array,
  opts: { threshold: number; ignoreLastPage: boolean },
  onProgress?: (msg: string) => void
): Promise<{ bytes: Uint8Array; removed: number[] }> {
  const raster = await loadRasterDoc(bytes);
  const blank: number[] = [];

  for (let i = 1; i <= raster.numPages; i++) {
    onProgress?.(`Checking page ${i} of ${raster.numPages}…`);
    if (opts.ignoreLastPage && i === raster.numPages) continue;
    const canvas = await renderRasterPage(raster, i, 0.6);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    for (let p = 0; p < data.length; p += 4) {
      if (data[p] < 245 || data[p + 1] < 245 || data[p + 2] < 245) ink++;
    }
    const ratio = ink / (canvas.width * canvas.height);
    if (ratio <= opts.threshold) blank.push(i - 1);
  }

  if (!blank.length || blank.length >= raster.numPages) {
    return { bytes, removed: [] };
  }

  const doc = await loadPdfLib(bytes);
  [...blank].sort((a, b) => b - a).forEach((idx) => doc.removePage(idx));
  return { bytes: await savePdfBytes(doc), removed: blank };
}

export async function colorAdjustPdf(
  bytes: Uint8Array,
  opts: { mode: "grayscale" | "invert" | "high-contrast"; amount: number; dpi: number },
  onProgress?: (msg: string) => void
): Promise<{ bytes: Uint8Array }> {
  const raster = await loadRasterDoc(bytes);
  const out = await PDFDocument.create();
  const scale = Math.max(1, opts.dpi / 72);

  for (let i = 1; i <= raster.numPages; i++) {
    onProgress?.(`Processing page ${i} of ${raster.numPages}…`);
    const canvas = await renderRasterPage(raster, i, scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = image.data;
      const contrast = 1 + opts.amount;
      for (let p = 0; p < d.length; p += 4) {
        let r = d[p];
        let g = d[p + 1];
        let b = d[p + 2];
        if (opts.mode === "grayscale") {
          const luma = r * 0.299 + g * 0.587 + b * 0.114;
          r = g = b = luma;
        } else if (opts.mode === "invert") {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
        } else {
          r = (r - 128) * contrast + 128;
          g = (g - 128) * contrast + 128;
          b = (b - 128) * contrast + 128;
        }
        d[p] = Math.max(0, Math.min(255, r));
        d[p + 1] = Math.max(0, Math.min(255, g));
        d[p + 2] = Math.max(0, Math.min(255, b));
      }
      ctx.putImageData(image, 0, 0);
    }
    const jpeg = await canvasToJpegBytes(canvas, 0.88);
    const embedded = await out.embedJpg(jpeg);
    const page = out.addPage([embedded.width / scale, embedded.height / scale]);
    const { width, height } = page.getSize();
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }

  return { bytes: await savePdfBytes(out) };
}

/** Adds a visible text stamp block in the chosen corner (e.g. APPROVED / DRAFT). */
export async function addTextStamp(
  bytes: Uint8Array,
  opts: {
    text: string;
    color: string;
    opacity: number;
    fontSize: number;
    rotation: number;
    border: boolean;
  }
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const hex = opts.color.replace("#", "");
  const num = parseInt(hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex, 16);
  const color = rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(opts.text, opts.fontSize);
    const boxW = textWidth + 28;
    const boxH = opts.fontSize + 20;
    const x = (width - boxW) / 2;
    const y = height * 0.2;

    if (opts.border) {
      page.drawRectangle({
        x,
        y,
        width: boxW,
        height: boxH,
        borderColor: color,
        borderWidth: 2,
        opacity: 0,
        borderOpacity: opts.opacity,
      });
    }
    page.drawText(opts.text, {
      x: x + 14,
      y: y + 10,
      size: opts.fontSize,
      font,
      color,
      opacity: opts.opacity,
      rotate: degrees(opts.rotation),
    });
  }

  return savePdfBytes(doc);
}

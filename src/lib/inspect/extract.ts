"use client";

import { PDFName } from "pdf-lib";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";
import { loadRasterDoc, type RasterDoc } from "@/lib/document/raster";

export interface ExtractedImage {
  name: string;
  page: number;
  width: number;
  height: number;
  blob: Blob;
}

interface PdfJsImage {
  width?: number;
  height?: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
}

const IMAGE_OPS = {
  paintImageXObject: 85,
  paintImageMaskXObject: 83,
  paintInlineImageXObject: 86,
};

export async function imageToCanvas(image: PdfJsImage): Promise<HTMLCanvasElement | null> {
  if (image.bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = image.bitmap.width;
    canvas.height = image.bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image.bitmap, 0, 0);
    return canvas;
  }

  const { width, height, kind, data } = image;
  if (!width || !height || !data) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const out = ctx.createImageData(width, height);

  if (kind === 3) {
    // RGBA
    out.data.set(data as Uint8ClampedArray);
  } else if (kind === 2) {
    // RGB
    for (let i = 0, j = 0; i < width * height; i++, j += 3) {
      out.data[i * 4] = data[j];
      out.data[i * 4 + 1] = data[j + 1];
      out.data[i * 4 + 2] = data[j + 2];
      out.data[i * 4 + 3] = 255;
    }
  } else if (kind === 1) {
    // 1-bit grayscale, packed 8 pixels per byte
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = data[y * rowBytes + (x >> 3)];
        const bit = (byte >> (7 - (x & 7))) & 1;
        const value = bit ? 255 : 0;
        const i = (y * width + x) * 4;
        out.data[i] = value;
        out.data[i + 1] = value;
        out.data[i + 2] = value;
        out.data[i + 3] = 255;
      }
    }
  } else {
    return null;
  }

  ctx.putImageData(out, 0, 0);
  return canvas;
}

export async function resolveObject(
  page: { objs: { get: (id: string) => unknown } },
  id: string
) {
  try {
    return page.objs.get(id) as PdfJsImage | undefined;
  } catch {
    return undefined;
  }
}

/** Extracts every embedded raster image, de-duplicated per page. */
export async function extractPdfImages(
  bytes: Uint8Array,
  onProgress?: (msg: string) => void
): Promise<ExtractedImage[]> {
  const doc: RasterDoc = await loadRasterDoc(bytes);
  const results: ExtractedImage[] = [];
  const seen = new Set<string>();

  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(`Scanning page ${p} of ${doc.numPages}…`);
    const page = await doc.getPage(p);
    const ops = await page.getOperatorList();

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      let image: PdfJsImage | undefined;
      let key = "";

      if (fn === IMAGE_OPS.paintImageXObject) {
        const id = String(ops.argsArray[i]?.[0] ?? "");
        key = `${p}:${id}`;
        if (!id || seen.has(key)) continue;
        seen.add(key);
        image = await resolveObject(page, id);
      } else if (fn === IMAGE_OPS.paintInlineImageXObject) {
        image = ops.argsArray[i]?.[0] as PdfJsImage | undefined;
        key = `${p}:inline:${i}`;
      } else {
        continue;
      }

      if (!image) continue;
      const canvas = await imageToCanvas(image);
      if (!canvas || canvas.width < 24 || canvas.height < 24) continue;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) continue;

      results.push({
        name: `page-${p}-image-${results.length + 1}.png`,
        page: p,
        width: canvas.width,
        height: canvas.height,
        blob,
      });
    }
  }

  return results;
}

export async function addAttachmentToPdf(
  bytes: Uint8Array,
  file: { name: string; bytes: Uint8Array; mime: string; description?: string }
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  await doc.attach(file.bytes, file.name, {
    mimeType: file.mime || "application/octet-stream",
    description: file.description || file.name,
    creationDate: new Date(),
    modificationDate: new Date(),
  });
  return savePdfBytes(doc);
}

export interface DocumentReport {
  stats: Array<{ label: string; value: string; tone?: "good" | "warn" | "bad" }>;
  lines: string[];
}

/** Full document fingerprint: sizes, metadata, security flags, structure. */
export async function documentReport(bytes: Uint8Array): Promise<DocumentReport> {
  const doc = await loadPdfLib(bytes);
  const raster = await loadRasterDoc(bytes);
  const stats: Array<{ label: string; value: string; tone?: "good" | "warn" | "bad" }> = [];
  const lines: string[] = [];

  stats.push({ label: "Pages", value: String(doc.getPageCount()) });
  stats.push({
    label: "File size",
    value: `${(bytes.byteLength / 1024).toFixed(1)} KB`,
  });

  const sizes = new Map<string, number>();
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const key = `${Math.round(width)} × ${Math.round(height)} pt`;
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  const sizeSummary = [...sizes.entries()]
    .map(([size, count]) => `${size}${count > 1 ? ` (×${count})` : ""}`)
    .join(", ");
  stats.push({ label: "Page sizes", value: sizeSummary || "—" });

  const title = doc.getTitle() || "";
  const author = doc.getAuthor() || "";
  stats.push({
    label: "Metadata",
    value: title || author ? [title, author].filter(Boolean).join(" · ") : "Empty",
    tone: title || author ? "warn" : "good",
  });

  const catalog = doc.catalog;
  const hasJs =
    catalog.has(PDFName.of("Names")) ||
    catalog.has(PDFName.of("OpenAction")) ||
    catalog.has(PDFName.of("AA"));
  stats.push({
    label: "JavaScript / auto actions",
    value: hasJs ? "Present" : "None",
    tone: hasJs ? "bad" : "good",
  });

  const hasAcroForm = catalog.has(PDFName.of("AcroForm"));
  let fieldCount = 0;
  if (hasAcroForm) {
    try {
      fieldCount = doc.getForm().getFields().length;
    } catch {
      fieldCount = 0;
    }
  }
  stats.push({ label: "Form fields", value: fieldCount ? String(fieldCount) : "None" });

  let attachments = 0;
  try {
    const atts = await raster.getAttachments();
    attachments = atts ? Object.keys(atts).length : 0;
  } catch {
    attachments = 0;
  }
  stats.push({ label: "Embedded files", value: attachments ? String(attachments) : "None" });

  let annotations = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.get(PDFName.of("Annots")) as unknown as
      | { size?: () => number }
      | undefined;
    annotations += annots?.size?.() ?? 0;
  }
  stats.push({ label: "Annotations", value: annotations ? String(annotations) : "None" });

  const encrypted = bytes.byteLength > 0 && hasKey(bytes);
  stats.push({
    label: "Encryption",
    value: encrypted ? "Detected" : "None",
    tone: encrypted ? "warn" : "good",
  });

  const info = await raster.getMetadata().catch(() => null);
  const metaInfo = (info?.info ?? {}) as Record<string, unknown>;
  lines.push(`Producer: ${String(metaInfo.Producer ?? "—")}`);
  lines.push(`Creator: ${String(metaInfo.Creator ?? "—")}`);
  lines.push(`Created: ${String(metaInfo.CreationDate ?? "—")}`);
  lines.push(`Modified: ${String(metaInfo.ModDate ?? "—")}`);
  lines.push(`PDF version: ${String(metaInfo.PDFFormatVersion ?? "—")}`);

  return { stats, lines };
}

function hasKey(bytes: Uint8Array): boolean {
  // Cheap scan for an /Encrypt entry in the trailer region.
  const tail = bytes.subarray(Math.max(0, bytes.byteLength - 4096));
  let text = "";
  for (let i = 0; i < tail.length; i += 4096) {
    text += String.fromCharCode(...tail.subarray(i, i + 4096));
  }
  return text.includes("/Encrypt");
}

/** Suggests a filename from the document's own title or first page text. */
export async function suggestFileName(bytes: Uint8Array, fallback = "document"): Promise<string> {
  const doc = await loadPdfLib(bytes);
  const title = doc.getTitle()?.trim();
  if (title && title.length > 2) return slug(title);

  const raster = await loadRasterDoc(bytes);
  const page = await raster.getPage(1);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return fallback;
  const date = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)?.[0];
  const firstLine = text.split(/[.!?·|]/)[0].slice(0, 70);
  const base = [date?.replace(/[/]/g, "-"), firstLine].filter(Boolean).join("-");
  const slugged = slug(base);
  return slugged.length > 3 ? slugged : fallback;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "document";
}

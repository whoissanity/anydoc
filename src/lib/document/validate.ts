"use client";

/** Content-based validation for untrusted uploads (AGENTS.md rule 2) — magic bytes, not extension/MIME, decide. */

/** 100 MB — well past any realistic PDF, small enough to bound parser memory. */
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
/** 32 MB per image when building a PDF or replacing an embedded image. */
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

const PDF_HEADER = "%PDF-";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

export type ImageKind = "png" | "jpeg";

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** The PDF spec permits the `%PDF-` header anywhere in the first 1024 bytes. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return ascii(bytes.subarray(0, 1024)).includes(PDF_HEADER);
}

/** Identifies a raster image by its signature, never by its declared MIME. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "jpeg";
  return null;
}

/** Rejects PDF bytes that fail the size or header check. */
export function assertPdfBytes(bytes: Uint8Array, label = "This file"): void {
  if (bytes.byteLength === 0) {
    throw new Error(`${label} is empty`);
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(`${label} is larger than the ${formatMb(MAX_PDF_BYTES)} limit`);
  }
  if (!looksLikePdf(bytes)) {
    throw new Error(`${label} is not a PDF — the file content does not start with a %PDF- header`);
  }
}

/** Validates a dropped PDF from its first kilobyte so an oversized or mislabelled file is not fully buffered. */
export async function readPdfFile(file: File): Promise<Uint8Array> {
  if (file.size === 0) throw new Error(`${file.name || "This file"} is empty`);
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`${file.name || "This file"} is larger than the ${formatMb(MAX_PDF_BYTES)} limit`);
  }

  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (!looksLikePdf(head)) {
    throw new Error(
      `${file.name || "This file"} is not a PDF — the content does not start with a %PDF- header`
    );
  }

  return new Uint8Array(await file.arrayBuffer());
}

/** Validates an image upload and reports the kind its bytes actually are. */
export async function readImageFile(
  file: File
): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg" }> {
  if (file.size === 0) throw new Error("This image is empty");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Images must be smaller than ${formatMb(MAX_IMAGE_BYTES)}`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImageKind(bytes);
  if (!kind) {
    throw new Error(`${file.name || "This file"} is not a PNG or JPEG image`);
  }

  return { bytes, mime: kind === "png" ? "image/png" : "image/jpeg" };
}

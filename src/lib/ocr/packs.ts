"use client";

import { get, set, del, keys } from "idb-keyval";
import manifestData from "../../../public/vendor/tesseract/lang/manifest.json";

export interface OcrPackMeta {
  code: string;
  label: string;
  bytes: number;
  sha256: string;
  vendored?: boolean;
}

export interface OcrManifest {
  version: number;
  defaultLanguage: string;
  generatedAt?: string;
  languages: Record<string, OcrPackMeta>;
  packs: OcrPackMeta[];
}

export interface OcrPackStatus extends OcrPackMeta {
  installed: boolean;
  installedBytes: number;
  source: "bundled" | "imported" | "missing";
  importedAt?: number;
}

export interface OcrStorageSummary {
  installedCount: number;
  totalCount: number;
  totalDiskUsageBytes: number;
  packs: OcrPackStatus[];
}

export interface PackVerificationResult {
  valid: boolean;
  code: string;
  error?: string;
  meta?: OcrPackMeta;
  actualSha256?: string;
  actualBytes?: number;
}

const META_PREFIX = "__ocr_pack_meta_";

/** Typed reference to the generated manifest. */
export const OCR_MANIFEST: OcrManifest = manifestData as unknown as OcrManifest;

/** Returns the manifest metadata for a given language code if recognized. */
export function getPackMeta(code: string): OcrPackMeta | undefined {
  const normalized = code.toLowerCase().trim();
  return OCR_MANIFEST.languages[normalized];
}

/** Computes the SHA-256 hexadecimal hash of a byte buffer. */
export async function computeSha256(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Node.js fallback for unit tests
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto");
    return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  } catch {
    throw new Error("SHA-256 computation is not supported in this environment");
  }
}

/** Gunzip compressed .traineddata.gz into raw .traineddata bytes if possible. */
export async function decompressGzip(bytes: Uint8Array): Promise<Uint8Array> {
  // Check gzip magic numbers 0x1F, 0x8B
  const isGzip = (bytes[0] === 31 && bytes[1] === 139) || (bytes[1] === 31 && bytes[0] === 139);
  if (!isGzip) return bytes;

  if (typeof DecompressionStream !== "undefined") {
    try {
      const ds = new DecompressionStream("gzip");
      const writer = ds.writable.getWriter();
      // Write and close stream
      void writer.write(bytes as unknown as BufferSource);
      void writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const out = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    } catch {
      // Fall through to returning raw bytes (Tesseract worker also contains an emscripten gunzip fallback)
      return bytes;
    }
  }

  // Node.js fallback for tests
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib = require("zlib");
    return new Uint8Array(zlib.gunzipSync(bytes));
  } catch {
    return bytes;
  }
}

/** Formats byte size into human readable string (e.g. 10.4 MB, 820 KB). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Key used by Tesseract.js cache inside idb-keyval. */
export function tesseractCacheKey(code: string): string {
  return `./${code.toLowerCase()}.traineddata`;
}

/** Verifies user-supplied file bytes against the offline manifest. */
export async function verifyUserPack(
  fileBytes: Uint8Array,
  suggestedCode?: string
): Promise<PackVerificationResult> {
  if (!fileBytes || fileBytes.length === 0) {
    return { valid: false, code: "", error: "The provided file is empty" };
  }

  const actualBytes = fileBytes.length;
  const actualSha256 = await computeSha256(fileBytes);

  // If a code was suggested (e.g. from filename "deu.traineddata.gz" -> "deu"), check that first
  let matchedMeta: OcrPackMeta | undefined;
  if (suggestedCode) {
    const meta = getPackMeta(suggestedCode);
    if (meta && meta.sha256 === actualSha256) {
      matchedMeta = meta;
    }
  }

  // Otherwise search manifest for matching SHA-256
  if (!matchedMeta) {
    matchedMeta = Object.values(OCR_MANIFEST.languages).find(
      (m) => m.sha256.toLowerCase() === actualSha256.toLowerCase()
    );
  }

  if (!matchedMeta) {
    // If suggested code exists but hash didn't match, give a specific mismatch error
    if (suggestedCode && getPackMeta(suggestedCode)) {
      const expected = getPackMeta(suggestedCode)!;
      return {
        valid: false,
        code: suggestedCode,
        error: `Checksum verification failed for "${expected.label}" (${suggestedCode}). Expected SHA-256 ${expected.sha256.slice(0, 12)}…, got ${actualSha256.slice(0, 12)}… (${formatBytes(actualBytes)}). Please ensure you have the official Tesseract 4.0 fast model file.`,
        meta: expected,
        actualSha256,
        actualBytes,
      };
    }

    return {
      valid: false,
      code: suggestedCode || "unknown",
      error: `Unrecognized language pack (SHA-256: ${actualSha256.slice(0, 12)}…, ${formatBytes(actualBytes)}). The file does not match any entry in the shipped offline manifest.`,
      actualSha256,
      actualBytes,
    };
  }

  // Verify byte length matches
  if (matchedMeta.bytes !== actualBytes) {
    return {
      valid: false,
      code: matchedMeta.code,
      error: `Size mismatch for "${matchedMeta.label}": expected ${matchedMeta.bytes} bytes, received ${actualBytes} bytes.`,
      meta: matchedMeta,
      actualSha256,
      actualBytes,
    };
  }

  return {
    valid: true,
    code: matchedMeta.code,
    meta: matchedMeta,
    actualSha256,
    actualBytes,
  };
}

/** Check if a language pack is currently available to use (vendored or imported). */
export async function isPackInstalled(code: string): Promise<boolean> {
  const norm = code.toLowerCase().trim();
  const meta = getPackMeta(norm);
  if (!meta) return false;
  if (meta.vendored) return true;

  try {
    if (typeof indexedDB === "undefined") return false;
    const cacheKey = tesseractCacheKey(norm);
    const data = await get(cacheKey);
    return typeof data !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Imports a verified user-supplied .traineddata.gz into IndexedDB so Tesseract.js
 * can load it offline same-origin with zero network requests.
 */
export async function importPack(
  fileBytes: Uint8Array,
  suggestedCode?: string
): Promise<{ success: boolean; code: string; label: string; error?: string }> {
  const verification = await verifyUserPack(fileBytes, suggestedCode);
  if (!verification.valid || !verification.meta) {
    return {
      success: false,
      code: verification.code,
      label: verification.meta?.label ?? verification.code,
      error: verification.error ?? "Pack verification failed",
    };
  }

  const { code, label } = verification.meta;

  try {
    // Decompress gzipped traineddata into raw bytes
    const decompressed = await decompressGzip(fileBytes);

    // Save into Tesseract's idb-keyval cache (key: `./${code}.traineddata`)
    const cacheKey = tesseractCacheKey(code);
    await set(cacheKey, decompressed);

    // Record metadata
    await set(`${META_PREFIX}${code}`, {
      code,
      label,
      bytes: fileBytes.length,
      decompressedBytes: decompressed.length,
      sha256: verification.actualSha256,
      importedAt: Date.now(),
    });

    return { success: true, code, label };
  } catch (err) {
    return {
      success: false,
      code,
      label,
      error: err instanceof Error ? err.message : "Failed to store language pack in IndexedDB",
    };
  }
}

/** Removes an imported language pack from IndexedDB. Bundled packs cannot be removed. */
export async function removePack(code: string): Promise<boolean> {
  const norm = code.toLowerCase().trim();
  const meta = getPackMeta(norm);
  if (meta?.vendored) return false;

  try {
    await del(tesseractCacheKey(norm));
    await del(`${META_PREFIX}${norm}`);
    return true;
  } catch {
    return false;
  }
}

/** Summarizes the status and disk usage of all language packs in the manifest. */
export async function getPacksSummary(): Promise<OcrStorageSummary> {
  const list: OcrPackStatus[] = [];
  let totalDiskUsageBytes = 0;
  let installedCount = 0;

  let allKeys: IDBValidKey[] = [];
  try {
    if (typeof indexedDB !== "undefined") {
      allKeys = await keys();
    }
  } catch {
    allKeys = [];
  }

  for (const pack of OCR_MANIFEST.packs) {
    const isVendored = !!pack.vendored;
    const cacheKey = tesseractCacheKey(pack.code);
    const hasImport = allKeys.includes(cacheKey);

    let installed = false;
    let installedBytes = 0;
    let source: "bundled" | "imported" | "missing" = "missing";

    if (isVendored) {
      installed = true;
      installedBytes = pack.bytes;
      source = "bundled";
    } else if (hasImport) {
      installed = true;
      source = "imported";
      try {
        const meta = await get(`${META_PREFIX}${pack.code}`);
        installedBytes = meta?.decompressedBytes || meta?.bytes || pack.bytes;
      } catch {
        installedBytes = pack.bytes;
      }
    }

    if (installed) {
      installedCount += 1;
      totalDiskUsageBytes += installedBytes;
    }

    list.push({
      ...pack,
      installed,
      installedBytes,
      source,
    });
  }

  return {
    installedCount,
    totalCount: OCR_MANIFEST.packs.length,
    totalDiskUsageBytes,
    packs: list,
  };
}

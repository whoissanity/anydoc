"use client";

import JSZip from "jszip";

/**
 * Client-side document → text extraction: the browser twin of the removed from-office
 * route. Every guard the server enforced travels with it — size caps, magic-byte checks,
 * XML DTD rejection and archive-bomb limits now protect the user's tab instead of a host.
 */

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 500_000;
const MAX_HTML_INPUT_CHARS = 2_000_000;
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_SCANNED_PARTS = 300;

const ZIP_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx", ".odt", ".epub"]);
const OLE_EXTENSIONS = new Set([".xls", ".doc"]);
const OLE_PREFIX = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const DTD_PATTERN = /<!DOCTYPE|<!ENTITY/i;

const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8");

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

function startsWithZip(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function startsWithRtf(bytes: Uint8Array): boolean {
  return latin1.decode(bytes.subarray(0, 5)) === "{\\rtf";
}

function extensionOf(name: string): string {
  return (name.toLowerCase().match(/\.[^.]+$/) ?? [""])[0];
}

/** Copies a view into a standalone ArrayBuffer for libraries that need one (mammoth, exceljs). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Verifies bytes match the claimed extension — an extension is not evidence of content (AGENTS.md rule 2). */
export function describeContentMismatch(extension: string, bytes: Uint8Array): string | null {
  const isOle = hasPrefix(bytes, OLE_PREFIX);
  const isRtf = startsWithRtf(bytes);

  if (ZIP_EXTENSIONS.has(extension)) {
    return startsWithZip(bytes)
      ? null
      : `This ${extension} file is not a valid Office/OpenDocument archive`;
  }
  if (OLE_EXTENSIONS.has(extension)) {
    return isOle || startsWithZip(bytes) || isRtf
      ? null
      : `This ${extension} file is not a valid legacy document`;
  }
  if (extension === ".rtf" && !isRtf) {
    return "This .rtf file does not contain RTF content";
  }
  return null;
}

/** Rejects archive XML carrying a DTD or entity declaration (defence in depth against entity expansion). */
async function assertNoDtdInArchive(bytes: Uint8Array): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return;
  }
  const parts = Object.keys(zip.files)
    .filter((name) => /\.(xml|rels)$/i.test(name))
    .slice(0, MAX_SCANNED_PARTS);

  for (const name of parts) {
    const entry = zip.file(name);
    if (!entry) continue;
    let xml: string;
    try {
      xml = await entry.async("string");
    } catch {
      continue;
    }
    if (DTD_PATTERN.test(xml)) throw new Error("Archive contains an XML DTD or entity declaration");
  }
}

/** Rejects decompression bombs before JSZip inflates a small upload without bound. */
function assertSafeArchive(zip: JSZip): void {
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("Archive contains too many entries to process safely");
  }
  let total = 0;
  for (const entry of entries) {
    const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize;
    total += typeof declared === "number" ? declared : 0;
    if (total > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error("Archive expands beyond the safe limit");
    }
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, code: string) =>
      String.fromCharCode((Number(code) + 65536) % 65536)
    )
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\line/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToText(html: string): string {
  return decodeXml(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function csvToText(raw: string, delimiter: string): string {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quoted) {
      if (ch === '"' && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows
    .map((cells) => cells.map((value) => value.replace(/\s+/g, " ").trim()).join("  |  "))
    .join("\n");
}

/** Best-effort UTF-16LE run extraction for legacy binaries with no RTF/OLE structure. */
function extractUtf16(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const runs: string[] = [];
  for (const offset of [0, 1]) {
    let run = "";
    for (let i = offset; i + 1 < bytes.length; i += 2) {
      const code = view.getUint16(i, true);
      const printable =
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code < 0x3000) ||
        (code >= 0x4e00 && code <= 0x9fff);
      if (printable) {
        run += String.fromCharCode(code);
      } else {
        if (run.trim().length >= 4) runs.push(run.trim());
        run = "";
      }
    }
    if (run.trim().length >= 4) runs.push(run.trim());
  }
  return runs.join(" ").replace(/\s{2,}/g, " ");
}

/** Best-effort printable-run extraction for legacy binaries with no text layer metadata. */
function salvageText(bytes: Uint8Array): string {
  const runs = latin1.decode(bytes).match(/[\x20-\x7E\r\n\t]{6,}/g) ?? [];
  return runs
    .filter((run) => /[a-zA-Z]{3}/.test(run))
    .map((run) => run.replace(/\s+/g, " ").trim())
    .join("\n");
}

async function spreadsheetText(bytes: Uint8Array): Promise<string> {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toArrayBuffer(bytes));
    const parts: string[] = [];
    workbook.eachSheet((sheet) => {
      parts.push(`# ${sheet.name}`);
      sheet.eachRow((row) => {
        const values = (row.values as unknown[]).slice(1).map((value) => (value == null ? "" : String(value)));
        if (values.some((value) => value.trim())) parts.push(values.join("  |  "));
      });
      parts.push("");
    });
    return parts.join("\n");
  } catch {
    return salvageText(bytes);
  }
}

function slideNumber(entry: string): number {
  return Number(entry.match(/slide(\d+)\.xml/)?.[1] ?? 0);
}

async function presentationText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  assertSafeArchive(zip);
  const slides = Object.keys(zip.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const parts: string[] = [];
  for (let index = 0; index < slides.length; index++) {
    const file = zip.file(slides[index]);
    if (!file) continue;
    const xml = await file.async("string");
    const paragraphs = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((match) =>
      [...match[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map((textMatch) => decodeXml(textMatch[1]))
        .join("")
        .trim()
    );
    parts.push(`# Slide ${index + 1}`, ...paragraphs.filter(Boolean), "");
  }
  return parts.join("\n");
}

async function odtText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  assertSafeArchive(zip);
  const content = await zip.file("content.xml")?.async("string");
  if (!content) return "";

  const blocks = content.match(/<text:(?:h|p)[^>]*>[\s\S]*?<\/text:(?:h|p)>/g) ?? [];
  return blocks
    .map((block) => {
      const level = block.match(/text:outline-level="(\d)"/)?.[1];
      const inner = block
        .replace(/^<text:[^>]+>/, "")
        .replace(/<\/text:[^>]+>$/, "")
        .replace(/<text:tab\/>/g, "\t")
        .replace(/<text:line-break\/>/g, "\n")
        .replace(/<text:s(?:[^>]*)\/>/g, " ");
      const text = decodeXml(inner.replace(/<[^>]+>/g, "")).trim();
      return level ? `${"#".repeat(Math.min(4, Number(level)))} ${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}

async function epubText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  assertSafeArchive(zip);
  const chapters = Object.keys(zip.files)
    .filter((entry) => /\.(xhtml|html?)$/i.test(entry))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const parts: string[] = [];
  for (const chapter of chapters) {
    const file = zip.file(chapter);
    if (!file) continue;
    const text = htmlToText(await file.async("string"));
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

async function legacyWordText(bytes: Uint8Array): Promise<string> {
  if (startsWithZip(bytes)) {
    const mammoth = (await import("mammoth")).default;
    return (await mammoth.extractRawText({ arrayBuffer: toArrayBuffer(bytes) })).value;
  }
  if (startsWithRtf(bytes)) return rtfToText(latin1.decode(bytes));
  const utf16 = extractUtf16(bytes);
  const ascii = salvageText(bytes);
  return (utf16.length >= ascii.length ? utf16 : ascii).trim();
}

async function extractByExtension(extension: string, bytes: Uint8Array): Promise<string> {
  switch (extension) {
    case ".docx": {
      const mammoth = (await import("mammoth")).default;
      return (await mammoth.extractRawText({ arrayBuffer: toArrayBuffer(bytes) })).value;
    }
    case ".xlsx":
    case ".xls":
      return spreadsheetText(bytes);
    case ".pptx":
      return presentationText(bytes);
    case ".odt":
      return odtText(bytes);
    case ".epub":
      return epubText(bytes);
    case ".rtf":
      return rtfToText(utf8.decode(bytes));
    case ".csv":
      return csvToText(utf8.decode(bytes), ",");
    case ".tsv":
      return csvToText(utf8.decode(bytes), "\t");
    case ".html":
    case ".htm":
      return htmlToText(utf8.decode(bytes));
    case ".md":
    case ".markdown":
    case ".txt":
    case ".log":
    case ".yml":
    case ".yaml":
      return utf8.decode(bytes);
    case ".json":
      return prettyJson(utf8.decode(bytes));
    case ".xml":
      return utf8.decode(bytes).replace(/></g, ">\n<");
    case ".doc":
      return legacyWordText(bytes);
    default: {
      const decoded = utf8.decode(bytes);
      const printable = decoded.split("").filter((ch) => ch >= " " || ch === "\n" || ch === "\t").length;
      if (printable / Math.max(1, decoded.length) < 0.85) {
        throw new Error(`Unsupported format: ${extension || "unknown"}`);
      }
      return decoded;
    }
  }
}

function boundText(text: string): string {
  const bounded =
    text.length > MAX_TEXT_CHARS
      ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated at ${MAX_TEXT_CHARS} characters]`
      : text;
  return bounded.trim() ? bounded : "[No extractable text in this document]";
}

/** Converts any supported document format to PDF-ready text, preserving headings and lists. */
export async function extractDocumentText(file: File): Promise<string> {
  if (file.size === 0) throw new Error("The file is empty");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Files must be smaller than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = extensionOf(file.name);

  const mismatch = describeContentMismatch(extension, bytes);
  if (mismatch) throw new Error(mismatch);

  if (ZIP_EXTENSIONS.has(extension)) {
    try {
      await assertNoDtdInArchive(bytes);
    } catch {
      throw new Error("This document declares an XML DTD or entity, which is not accepted");
    }
  }

  return boundText(await extractByExtension(extension, bytes));
}

/** HTML → capped, PDF-ready text (the browser twin of the old from-html route body). */
export function htmlDocumentText(html: string): string {
  if (html.length > MAX_HTML_INPUT_CHARS) throw new Error("HTML input is too large");
  return boundText(htmlToText(html));
}

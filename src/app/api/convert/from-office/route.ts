import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PageSizes, type PDFFont, type PDFPage } from "pdf-lib";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { safeDownloadName } from "@/lib/security/filename";
import { CROSS_ORIGIN_REFUSED, isSameOriginRequest } from "@/lib/security/request";

/** Upload ceiling: big enough for real Office files, small enough to bound work. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** A single document must not be able to generate thousands of PDF pages. */
const MAX_TEXT_CHARS = 500_000;
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx", ".odt", ".epub"]);
const OLE_EXTENSIONS = new Set([".xls", ".doc"]);

function startsWithZip(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/** Verifies bytes match the claimed extension — an extension is not evidence of content. */
function describeContentMismatch(extension: string, buffer: Buffer): string | null {
  const isOle = buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE_SIGNATURE);
  const isRtf = buffer.subarray(0, 5).toString("latin1") === "{\\rtf";

  if (ZIP_EXTENSIONS.has(extension)) {
    if (startsWithZip(buffer)) return null;
    return `This ${extension} file is not a valid Office/OpenDocument archive`;
  }
  if (OLE_EXTENSIONS.has(extension)) {
    if (isOle || startsWithZip(buffer) || isRtf) return null;
    return `This ${extension} file is not a valid legacy document`;
  }
  if (extension === ".rtf" && !isRtf) {
    return "This .rtf file does not contain RTF content";
  }
  return null;
}

const DTD_PATTERN = /<!DOCTYPE|<!ENTITY/i;
const MAX_SCANNED_PARTS = 300;

/** Rejects archive XML carrying a DTD or entity declaration (defence in depth vs XXE). */
async function assertNoDtdInArchive(buffer: Buffer): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return; // Not a readable ZIP; the format parsers will reject it.
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
    if (DTD_PATTERN.test(xml)) {
      throw new Error("Archive contains an XML DTD or entity declaration");
    }
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

/** Converts any supported document format to PDF, preserving headings and lists. */

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(CROSS_ORIGIN_REFUSED, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Files must be smaller than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB` },
      { status: 413 }
    );
  }

  const name = file.name.toLowerCase();
  const extension = (name.match(/\.[^.]+$/) ?? [""])[0];
  const buffer = Buffer.from(await file.arrayBuffer());

  const mismatch = describeContentMismatch(extension, buffer);
  if (mismatch) {
    return NextResponse.json({ error: mismatch }, { status: 400 });
  }

  // Office files are ZIPs of XML; a DTD/entity declaration is rejected up front (VibeSec: XXE).
  if (ZIP_EXTENSIONS.has(extension)) {
    try {
      await assertNoDtdInArchive(buffer);
    } catch {
      return NextResponse.json(
        { error: "This document declares an XML DTD or entity, which is not accepted" },
        { status: 400 }
      );
    }
  }

  let text = "";

  try {
    if (extension === ".docx") {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (extension === ".xlsx" || extension === ".xls") {
      text = await spreadsheetText(buffer);
    } else if (extension === ".pptx") {
      text = await presentationText(buffer);
    } else if (extension === ".odt") {
      text = await odtText(buffer);
    } else if (extension === ".epub") {
      text = await epubText(buffer);
    } else if (extension === ".rtf") {
      text = rtfToText(buffer.toString("utf8"));
    } else if (extension === ".csv" || extension === ".tsv") {
      text = csvToText(buffer.toString("utf8"), extension === ".tsv" ? "\t" : ",");
    } else if (extension === ".html" || extension === ".htm") {
      text = htmlToText(buffer.toString("utf8"));
    } else if ([".md", ".markdown", ".txt", ".log", ".yml", ".yaml"].includes(extension)) {
      text = buffer.toString("utf8");
    } else if (extension === ".json") {
      text = prettyJson(buffer.toString("utf8"));
    } else if (extension === ".xml") {
      text = buffer.toString("utf8").replace(/></g, ">\n<");
    } else if (extension === ".doc") {
      text = await legacyWordText(buffer);
    } else {
      // Unknown extension: accept it when it looks like plain text.
      const decoded = buffer.toString("utf8");
      const printable = decoded.split("").filter((ch) => ch >= " " || ch === "\n" || ch === "\t").length;
      if (printable / Math.max(1, decoded.length) < 0.85) {
        return NextResponse.json(
          { error: `Unsupported format: ${extension || "unknown"}` },
          { status: 400 }
        );
      }
      text = decoded;
    }
  } catch (error) {
    // Parser internals stay server-side; the client only learns that it failed.
    console.error("Document conversion failed:", error);
    return NextResponse.json(
      {
        error:
          "This document could not be read — it may be damaged or use an unsupported variant.",
      },
      { status: 400 }
    );
  }

  if (text.length > MAX_TEXT_CHARS) {
    text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated at ${MAX_TEXT_CHARS} characters]`;
  }
  if (!text.trim()) text = "[No extractable text in this document]";
  const bytes = await renderTextPdf(text, file.name);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeDownloadName(file.name)}.pdf"`,
    },
  });
}

/* ─── Extraction ─────────────────────────────────────────────────────────── */

async function spreadsheetText(buffer: Buffer): Promise<string> {
  try {
    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error Node Buffer is accepted by ExcelJS
    await workbook.xlsx.load(buffer);
    const parts: string[] = [];
    workbook.eachSheet((sheet) => {
      parts.push(`# ${sheet.name}`);
      sheet.eachRow((row) => {
        const values = (row.values as unknown[])
          .slice(1)
          .map((value) => (value == null ? "" : String(value)));
        if (values.some((value) => value.trim())) parts.push(values.join("  |  "));
      });
      parts.push("");
    });
    return parts.join("\n");
  } catch {
    // Legacy .xls and damaged files fall back to a text salvage.
    return salvageText(buffer);
  }
}

async function presentationText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
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
    const lines = paragraphs.filter(Boolean);
    parts.push(`# Slide ${index + 1}`, ...lines, "");
  }
  return parts.join("\n");
}

function slideNumber(entry: string): number {
  return Number(entry.match(/slide(\d+)\.xml/)?.[1] ?? 0);
}

async function odtText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  assertSafeArchive(zip);
  const content = await zip.file("content.xml")?.async("string");
  if (!content) return "";

  const blocks = content.match(/<text:(?:h|p)[^>]*>[\s\S]*?<\/text:(?:h|p)>/g) ?? [];
  return blocks
    .map((block) => {
      const level = block.match(/text:outline-level="(\d)"/)?.[1];
      let inner = block
        .replace(/^<text:[^>]+>/, "")
        .replace(/<\/text:[^>]+>$/, "")
        .replace(/<text:tab\/>/g, "\t")
        .replace(/<text:line-break\/>/g, "\n")
        .replace(/<text:s(?:[^>]*)\/>/g, " ");
      inner = decodeXml(inner.replace(/<[^>]+>/g, "")).trim();
      return level ? `${"#".repeat(Math.min(4, Number(level)))} ${inner}` : inner;
    })
    .filter(Boolean)
    .join("\n");
}

async function epubText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  assertSafeArchive(zip);
  const chapters = Object.keys(zip.files)
    .filter((entry) => /\.(xhtml|html?)$/i.test(entry))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const parts: string[] = [];
  for (const chapter of chapters) {
    const file = zip.file(chapter);
    if (!file) continue;
    const html = await file.async("string");
    const text = htmlToText(html);
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join("\n\n");
}

async function legacyWordText(buffer: Buffer): Promise<string> {
  if (buffer.subarray(0, 2).toString("latin1") === "PK") {
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (buffer.subarray(0, 5).toString("latin1") === "{\\rtf") {
    return rtfToText(buffer.toString("latin1"));
  }
  // OLE binary: salvage the UTF-16LE and ASCII text runs.
  const utf16 = extractUtf16(buffer);
  const ascii = salvageText(buffer);
  return (utf16.length >= ascii.length ? utf16 : ascii).trim();
}

function extractUtf16(buffer: Buffer): string {
  const runs: string[] = [];
  for (const offset of [0, 1]) {
    let run = "";
    for (let i = offset; i + 1 < buffer.length; i += 2) {
      const code = buffer.readUInt16LE(i);
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

function salvageText(buffer: Buffer): string {
  const runs = buffer.toString("latin1").match(/[\x20-\x7E\r\n\t]{6,}/g) ?? [];
  return runs
    .filter((run) => /[a-zA-Z]{3}/.test(run))
    .map((run) => run.replace(/\s+/g, " ").trim())
    .join("\n");
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

function htmlToText(html: string): string {
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

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
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

/* ─── Rendering ──────────────────────────────────────────────────────────── */

function pdfSafe(value: string): string {
  return value
    // Control chars are not WinAnsi-encodable and appear in text salvaged from damaged files.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
    .replace(/[^\u0000-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

async function renderTextPdf(text: string, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("AnyDoc");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  const [pageWidth, pageHeight] = PageSizes.Letter;
  const maxWidth = pageWidth - margin * 2;

  let page: PDFPage = doc.addPage(PageSizes.Letter);
  let cursorY = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < margin) {
      page = doc.addPage(PageSizes.Letter);
      cursorY = pageHeight - margin;
    }
  };

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!rawLine.trim()) {
      cursorY -= 7;
      continue;
    }

    const heading = rawLine.match(/^(#{1,4})\s+(.*)$/);
    const bullet = rawLine.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = rawLine.match(/^\s*(\d{1,3}[.)])\s+(.*)$/);

    let content = rawLine.trim();
    let size = 11;
    let font = regular;
    let indent = 0;

    if (heading) {
      const level = heading[1].length;
      content = heading[2];
      size = level === 1 ? 20 : level === 2 ? 16 : 13;
      font = bold;
      cursorY -= 6;
    } else if (bullet) {
      content = `• ${bullet[1]}`;
      indent = 14;
    } else if (numbered) {
      content = `${numbered[1]} ${numbered[2]}`;
      indent = 14;
    }

    const lineHeight = size * 1.38;
    for (const line of wrapText(pdfSafe(content), font, size, maxWidth - indent)) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: margin + indent,
        y: cursorY,
        size,
        font,
        color: rgb(0.05, 0.05, 0.05),
      });
      cursorY -= lineHeight;
    }
    if (heading) cursorY -= 4;
  }

  return doc.save();
}

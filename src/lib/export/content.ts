"use client";

import { loadPdfLib } from "@/lib/document/pages";
import { loadRasterDoc } from "@/lib/document/raster";
import { pdfFieldKind } from "@/lib/edit/forms";
import type {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";

// Structured PDF content for every export writer; parsed once per export, not once per format.

export interface ExportLine {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  x: number;
  y: number;
  /** 1–3 when the line looks like a heading, otherwise null. */
  level: 1 | 2 | 3 | null;
}

export interface ExportPage {
  index: number;
  lines: ExportLine[];
}

export interface ExportTable {
  pageIndex: number;
  rows: string[][];
}

export interface ExportField {
  name: string;
  type: string;
  value: string;
}

export interface DocumentContent {
  title: string;
  pages: ExportPage[];
  tables: ExportTable[];
  fields: ExportField[];
  /** ISO timestamp used for ODF/EPUB metadata. */
  generatedAt: string;
}

export type ProgressHandler = (percent: number, label: string) => void;

interface RawItem {
  x: number;
  y: number;
  text: string;
  size: number;
  width: number;
  bold: boolean;
  italic: boolean;
}

function median(values: number[], fallback = 10): number {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!clean.length) return fallback;
  const sorted = [...clean].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Bold/italic inferred from the embedded font name, the only styling PDF.js exposes.
function styleFlags(fontName: string | undefined, family: string | undefined) {
  const haystack = `${fontName ?? ""} ${family ?? ""}`.toLowerCase();
  return {
    bold: /bold|black|heavy|semibold|demi/.test(haystack),
    italic: /italic|oblique/.test(haystack),
  };
}

function clusterRows(items: RawItem[]): RawItem[][] {
  const rows: RawItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(current[0].y - item.y) <= Math.max(2, item.size * 0.55)) {
      current.push(item);
    } else {
      rows.push([item]);
    }
  }
  return rows;
}

function groupLines(items: RawItem[]): ExportLine[] {
  return clusterRows(items)
    .map((cluster) => {
      const sorted = [...cluster].sort((a, b) => a.x - b.x);
      let text = "";
      let cursor = -Infinity;
      let boldChars = 0;
      let italicChars = 0;
      let chars = 0;

      for (const item of sorted) {
        const clean = item.text.replace(/\s+/g, " ").trim();
        if (!clean) continue;
        if (text && item.x - cursor > item.size * 1.7) text += "  ";
        else if (text && !text.endsWith(" ")) text += " ";
        text += clean;
        cursor = item.x + (item.width || clean.length * item.size * 0.5);
        const length = clean.length;
        if (item.bold) boldChars += length;
        if (item.italic) italicChars += length;
        chars += length;
      }

      const size = Math.max(...cluster.map((item) => item.size));
      return {
        text: text.trim(),
        size,
        bold: chars > 0 && boldChars / chars >= 0.6,
        italic: chars > 0 && italicChars / chars >= 0.6,
        x: sorted[0]?.x ?? 0,
        y: cluster[0].y,
        level: null,
      };
    })
    .filter((line) => line.text.length > 0);
}

// Detects tables as consistent multi-cell rows, normalised to a rectangle for the writers.
function extractTables(pageIndex: number, items: RawItem[]): ExportTable[] {
  if (items.length < 4) return [];

  const charWidth = median(
    items.map((item) => item.width / Math.max(1, item.text.trim().length)),
    5
  );
  const rows: string[][] = [];

  for (const cluster of clusterRows(items)) {
    const sorted = [...cluster].sort((a, b) => a.x - b.x);
    const cells: string[] = [];
    let cell = "";
    let cursor: number | null = null;

    for (const item of sorted) {
      const clean = item.text.replace(/\s+/g, " ").trim();
      if (!clean) continue;
      if (cursor !== null && item.x - cursor > Math.max(8, charWidth * 3)) {
        if (cell.trim()) cells.push(cell.trim());
        cell = "";
      }
      cell += (cell ? " " : "") + clean;
      cursor = item.x + (item.width || clean.length * charWidth);
    }
    if (cell.trim()) cells.push(cell.trim());

    if (cells.filter((value) => value.length > 0).length >= 2) {
      rows.push(cells);
    }
  }

  // A single two-cell row is far more likely to be prose than a table.
  if (rows.length < 2) return [];

  const width = Math.max(...rows.map((row) => row.length));
  return [
    {
      pageIndex,
      rows: rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]),
    },
  ];
}

/** Reads AcroForm key/value pairs with pdf-lib; unreadable forms yield nothing. */
async function readFields(bytes: Uint8Array): Promise<ExportField[]> {
  try {
    const doc = await loadPdfLib(bytes);
    const form = doc.getForm();
    const out: ExportField[] = [];

    for (const field of form.getFields()) {
      const name = field.getName();
      const kind = pdfFieldKind(field);
      try {
        if (kind === "checkbox") {
          out.push({ name, type: "checkbox", value: String((field as PDFCheckBox).isChecked()) });
        } else if (kind === "radio") {
          out.push({ name, type: "radio", value: (field as PDFRadioGroup).getSelected() ?? "" });
        } else if (kind === "dropdown") {
          out.push({
            name,
            type: "dropdown",
            value: (field as PDFDropdown).getSelected()[0] ?? "",
          });
        } else if (kind === "list") {
          out.push({ name, type: "list", value: (field as PDFOptionList).getSelected()[0] ?? "" });
        } else if (kind === "text") {
          out.push({ name, type: "text", value: (field as PDFTextField).getText() ?? "" });
        } else {
          out.push({ name, type: "other", value: "" });
        }
      } catch {
        out.push({ name, type: "unreadable", value: "" });
      }
    }
    return out;
  } catch {
    return [];
  }
}

// OCR text as lines for a scan with no text layer; descending y preserves reading order.
function linesFromOcr(text: string | undefined): ExportLine[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line, index) => ({
      text: line,
      size: 10,
      bold: false,
      italic: false,
      x: 0,
      y: -index,
      level: null,
    }));
}

export async function extractDocumentContent(
  bytes: Uint8Array,
  onProgress?: ProgressHandler,
  ocrText?: ReadonlyMap<number, string> | null
): Promise<DocumentContent> {
  const doc = await loadRasterDoc(bytes);
  const metadata = await doc.getMetadata().catch(() => null);
  const info = (metadata?.info ?? {}) as Record<string, unknown>;
  const title = String(info.Title ?? "").trim() || "Document";

  const pages: ExportPage[] = [];
  const tables: ExportTable[] = [];
  const allSizes: number[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    onProgress?.(
      Math.round(((pageNumber - 1) / Math.max(1, doc.numPages)) * 70),
      `Reading page ${pageNumber} of ${doc.numPages}…`
    );

    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const styles = (content.styles ?? {}) as Record<string, { fontFamily?: string }>;
    const items: RawItem[] = [];

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , c, d, e, f] = item.transform as number[];
      const size = Math.hypot(c, d) || item.height || 10;
      const flags = styleFlags(item.fontName, styles[item.fontName]?.fontFamily);
      items.push({
        x: e,
        y: f,
        text: item.str,
        size,
        width: item.width ?? 0,
        bold: flags.bold,
        italic: flags.italic,
      });
      allSizes.push(size);
    }

    const lines = groupLines(items);
    // Scanned page has no text layer; fall back to OCR so the export is not blank.
    pages.push({
      index: pageNumber - 1,
      lines: lines.length ? lines : linesFromOcr(ocrText?.get(pageNumber - 1)),
    });
    const pageTables = extractTables(pageNumber - 1, items);
    if (pageTables.length) tables.push(...pageTables);
  }

  // Heading levels are relative to the document's own body size.
  const bodySize = median(allSizes, 10);
  for (const page of pages) {
    for (const line of page.lines) {
      const ratio = line.size / bodySize;
      if (ratio >= 1.45 && line.text.length < 140) {
        line.level = ratio >= 2.1 ? 1 : ratio >= 1.75 ? 2 : 3;
      }
    }
  }

  onProgress?.(80, "Reading form fields…");
  const fields = await readFields(bytes);

  return { title, pages, tables, fields, generatedAt: new Date().toISOString() };
}

/** Rectangular, header-labelled matrix used by CSV, XLSX and ODS. */
export function buildDataMatrix(content: DocumentContent): string[][] {
  if (content.tables.length) {
    const width = Math.max(...content.tables.flatMap((table) => table.rows.map((row) => row.length)));
    const rows: string[][] = [
      ["Page", ...Array.from({ length: width }, (_, index) => `Column ${index + 1}`)],
    ];
    for (const table of content.tables) {
      for (const row of table.rows) {
        rows.push([String(table.pageIndex + 1), ...row, ...Array<string>(width - row.length).fill("")]);
      }
    }
    return rows;
  }

  const rows: string[][] = [["Page", "Text"]];
  for (const page of content.pages) {
    for (const line of page.lines) rows.push([String(page.index + 1), line.text]);
  }
  return rows;
}

// Form fields as a separate Field,Type,Value matrix so both datasets survive.
export function buildFieldMatrix(content: DocumentContent): string[][] {
  if (!content.fields.length) return [];
  return [
    ["Field", "Type", "Value"],
    ...content.fields.map((field) => [field.name, field.type, field.value]),
  ];
}

export function plainText(content: DocumentContent): string {
  return content.pages
    .map((page) => page.lines.map((line) => line.text).join("\n"))
    .join("\n\n");
}

export function headingFor(page: ExportPage, fallback: string): string {
  return page.lines.find((line) => line.level !== null)?.text ?? fallback;
}

"use client";

import { escapeCsvCell } from "@/lib/security/escape";
import {
  buildDataMatrix,
  buildFieldMatrix,
  plainText,
  type DocumentContent,
} from "../content";

function csvBlock(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

// Body first (tables, else page text), then form fields as a separate Field,Type,Value block.
export function toCsv(content: DocumentContent): string {
  const blocks: string[] = [csvBlock(buildDataMatrix(content))];

  const fields = buildFieldMatrix(content);
  if (fields.length) blocks.push(csvBlock(fields));

  return `${blocks.join("\r\n\r\n")}\r\n`;
}

// Keeps the structure other formats flatten: per-page lines with level/emphasis, tables, fields.
export function toJson(content: DocumentContent): string {
  const payload = {
    document: {
      title: content.title,
      pageCount: content.pages.length,
      generatedAt: content.generatedAt,
      generator: "AnyDoc",
    },
    fields: content.fields.map((field) => ({
      name: field.name,
      type: field.type,
      value: field.value,
    })),
    tables: content.tables.map((table) => ({
      page: table.pageIndex + 1,
      rows: table.rows,
    })),
    pages: content.pages.map((page) => ({
      page: page.index + 1,
      lines: page.lines.map((line) => ({
        text: line.text,
        level: line.level,
        bold: line.bold,
        italic: line.italic,
      })),
    })),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Plain-text writer: page blocks separated by a blank line. */
export function toTxt(content: DocumentContent): string {
  return `${plainText(content).trimEnd()}\n`;
}

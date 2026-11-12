"use client";

import JSZip from "jszip";
import { escapeXml } from "@/lib/security/escape";
import { buildDataMatrix, buildFieldMatrix, type DocumentContent } from "../content";

// Minimal SpreadsheetML via JSZip (no engine); every cell XML-escaped so PDF text cannot break out.
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT_SHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const CT_WORKBOOK = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const REL_SHEET = `${NS_REL}/worksheet`;
const REL_WORKBOOK = `${NS_REL}/officeDocument`;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface Sheet {
  name: string;
  rows: string[][];
}

function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function sheetXml(matrix: string[][]): string {
  const rows = matrix
    .map((row, rowIndex) => {
      const cells = row
        .map(
          (cell, cellIndex) =>
            `<c r="${columnName(cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
              cell
            )}</t></is></c>`
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `${XML_DECL}
<worksheet xmlns="${NS_MAIN}"><sheetData>${rows}</sheetData></worksheet>`;
}

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="${CT_SHEET}"/>`
  ).join("");

  return `${XML_DECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT_WORKBOOK}"/>${overrides}</Types>`;
}

function workbookXml(sheets: Sheet[]): string {
  const entries = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )
    .join("");

  return `${XML_DECL}
<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${entries}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount: number): string {
  const rels = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="${REL_SHEET}" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");

  return `${XML_DECL}
<Relationships xmlns="${NS_PKG_REL}">${rels}</Relationships>`;
}

export async function buildXlsx(content: DocumentContent): Promise<Blob> {
  const sheets: Sheet[] = [{ name: "Exported", rows: buildDataMatrix(content) }];
  const fields = buildFieldMatrix(content);
  if (fields.length) sheets.push({ name: "Fields", rows: fields });

  const zip = new JSZip();

  zip.file("[Content_Types].xml", contentTypesXml(sheets.length));
  zip.file(
    "_rels/.rels",
    `${XML_DECL}
<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${REL_WORKBOOK}" Target="xl/workbook.xml"/></Relationships>`
  );
  zip.file("xl/workbook.xml", workbookXml(sheets));
  zip.file("xl/_rels/workbook.xml.rels", workbookRelsXml(sheets.length));
  sheets.forEach((sheet, index) => {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet.rows));
  });

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: XLSX_MIME });
}

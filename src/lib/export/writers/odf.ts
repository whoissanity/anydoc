"use client";

import JSZip from "jszip";
import { escapeXml } from "@/lib/security/escape";
import { buildDataMatrix, buildFieldMatrix, type DocumentContent } from "../content";

// ODT/ODS: JSZip preserves insertion order, so plain-text mimetype stays first and uncompressed.

const OFFICE_NS = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const TABLE_NS = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
const MANIFEST_NS = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";
const META_NS = "urn:oasis:names:tc:opendocument:xmlns:meta:1.0";

const ODT_MIME = "application/vnd.oasis.opendocument.text";
const ODS_MIME = "application/vnd.oasis.opendocument.spreadsheet";

function manifestFor(mime: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="${MANIFEST_NS}" manifest:version="1.2">
 <manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;
}

function metaXml(title: string, generatedAt: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="${OFFICE_NS}" xmlns:meta="${META_NS}" office:version="1.2">
 <office:meta><meta:generator>AnyDoc</meta:generator><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${escapeXml(
   title
 )}</dc:title><meta:creation-date>${escapeXml(generatedAt)}</meta:creation-date></office:meta>
</office:document-meta>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="${OFFICE_NS}" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
 <office:styles/>
</office:document-styles>`;

export async function buildOdt(content: DocumentContent): Promise<Blob> {
  const body: string[] = [];

  for (const page of content.pages) {
    for (const line of page.lines) {
      if (line.level) {
        body.push(`<text:h text:outline-level="${line.level}">${escapeXml(line.text)}</text:h>`);
      } else {
        body.push(`<text:p>${escapeXml(line.text)}</text:p>`);
      }
    }
    body.push('<text:p text:style-name="PageBreak"/>');
  }

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="${OFFICE_NS}" xmlns:text="${TEXT_NS}" office:version="1.2">
 <office:body><office:text>${body.join("")}</office:text></office:body>
</office:document-content>`;

  const zip = new JSZip();
  zip.file("mimetype", ODT_MIME, { compression: "STORE" });
  zip.file("content.xml", contentXml);
  zip.file("styles.xml", STYLES_XML);
  zip.file("meta.xml", metaXml(content.title, content.generatedAt));
  zip.file("META-INF/manifest.xml", manifestFor(ODT_MIME));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: ODT_MIME });
}

function odsRows(matrix: string[][]): string {
  return matrix
    .map((row) => {
      const cells = row
        .map(
          (cell) =>
            `<table:table-cell office:value-type="string"><text:p>${escapeXml(cell)}</text:p></table:table-cell>`
        )
        .join("");
      return `<table:table-row>${cells}</table:table-row>`;
    })
    .join("");
}

export async function buildOds(content: DocumentContent): Promise<Blob> {
  // Detected tables on one sheet, form-field key/values on another.
  const tables: Array<{ name: string; rows: string[][] }> = [
    { name: "Exported", rows: buildDataMatrix(content) },
  ];
  const fields = buildFieldMatrix(content);
  if (fields.length) tables.push({ name: "Fields", rows: fields });

  const sheets = tables
    .map((table) => `<table:table table:name="${table.name}">${odsRows(table.rows)}</table:table>`)
    .join("");

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="${OFFICE_NS}" xmlns:text="${TEXT_NS}" xmlns:table="${TABLE_NS}" office:version="1.2">
 <office:body><office:spreadsheet>${sheets}</office:spreadsheet></office:body>
</office:document-content>`;

  const zip = new JSZip();
  zip.file("mimetype", ODS_MIME, { compression: "STORE" });
  zip.file("content.xml", contentXml);
  zip.file("styles.xml", STYLES_XML);
  zip.file("meta.xml", metaXml(content.title, content.generatedAt));
  zip.file("META-INF/manifest.xml", manifestFor(ODS_MIME));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: ODS_MIME });
}

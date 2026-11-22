"use client";

import { safeDownloadName } from "@/lib/security/filename";
import { pdfToMarkdown } from "@/lib/text/markdown";
import { extractDocumentContent, type ProgressHandler } from "./content";
import { formatMeta } from "./catalog";
import { buildDocx } from "./writers/docx";
import { buildPptx } from "./writers/pptx";
import { buildXlsx } from "./writers/xlsx";
import { buildOdt, buildOds } from "./writers/odf";
import { buildEpub } from "./writers/epub";
import { toRtf } from "./writers/rtf";
import { toHtml } from "./writers/html";
import { toCsv, toJson, toTxt } from "./writers/data";

// Client-side dispatcher: nothing uploaded; the PDF is parsed once, then handed to a writer.

export interface ExportProgress {
  percent: number;
  label: string;
}

export interface ExportOptions {
  fileName: string;
  onProgress?: (progress: ExportProgress) => void;
  /** Editor OCR text by zero-based page index; fallback for scans with no text layer. */
  ocrText?: ReadonlyMap<number, string> | null;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
}

export async function exportDocument(
  bytes: Uint8Array,
  format: string,
  options: ExportOptions
): Promise<ExportResult> {
  const meta = formatMeta(format);
  if (!meta) throw new Error(`Unsupported export format: ${format}`);

  const base = safeDownloadName(options.fileName || "document", "document");
  const report: ProgressHandler = (percent, label) =>
    options.onProgress?.({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      label,
    });

  // Markdown has its own structure detector, so it skips the shared extractor.
  if (format === "md") {
    report(15, "Reading document structure…");
    const markdown = await pdfToMarkdown(bytes, base, options.ocrText);
    return {
      blob: new Blob([markdown], { type: meta.mime }),
      filename: `${base}.${meta.extension}`,
    };
  }

  report(3, "Extracting document content…");
  const content = await extractDocumentContent(
    bytes,
    (percent, label) => report(percent * 0.55, label),
    options.ocrText
  );

  // Writers report 0–100 of their own packaging pass; map it into the last 45%.
  const inner = (percent: number, label: string) =>
    report(55 + Math.min(100, Math.max(0, percent)) * 0.45, label);

  report(58, "Building the file…");

  switch (format) {
    case "txt":
      return {
        blob: new Blob([toTxt(content)], { type: meta.mime }),
        filename: `${base}.${meta.extension}`,
      };
    case "html":
      return {
        blob: new Blob([toHtml(content)], { type: meta.mime }),
        filename: `${base}.${meta.extension}`,
      };
    case "csv":
      return {
        blob: new Blob([toCsv(content)], { type: meta.mime }),
        filename: `${base}.${meta.extension}`,
      };
    case "json":
      return {
        blob: new Blob([toJson(content)], { type: meta.mime }),
        filename: `${base}.${meta.extension}`,
      };
    case "rtf":
      return {
        blob: new Blob([toRtf(content)], { type: meta.mime }),
        filename: `${base}.${meta.extension}`,
      };
    case "docx": {
      inner(20, "Laying out the Word document…");
      const blob = await buildDocx(content);
      return { blob, filename: `${base}.${meta.extension}` };
    }
    case "xlsx": {
      inner(30, "Writing the spreadsheet…");
      const blob = await buildXlsx(content);
      return { blob, filename: `${base}.${meta.extension}` };
    }
    case "pptx": {
      const blob = await buildPptx(content, inner);
      return { blob, filename: `${base}.${meta.extension}` };
    }
    case "odt": {
      inner(35, "Packaging OpenDocument Text…");
      const blob = await buildOdt(content);
      return { blob, filename: `${base}.${meta.extension}` };
    }
    case "ods": {
      inner(35, "Packaging OpenDocument Spreadsheet…");
      const blob = await buildOds(content);
      return { blob, filename: `${base}.${meta.extension}` };
    }
    case "epub": {
      const blob = await buildEpub(content, inner);
      return { blob, filename: `${base}.${meta.extension}` };
    }
    default:
      throw new Error(`Export format "${format}" is handled elsewhere`);
  }
}

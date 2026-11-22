"use client";

import { detectImageKind, looksLikePdf } from "@/lib/document/validate";

/** Routes imports by content: PDF/image by signature, HTML by name; everything else goes to the in-browser document converter. */

export type ImportKind = "pdf" | "image" | "html" | "document";

const HTML_NAME = /\.(html?|xhtml)$/i;
const HTML_HEAD = /^\s*<(?:!doctype\s+html|html|head|body)\b/i;

export function classifyBytes(head: Uint8Array, name = ""): ImportKind {
  if (looksLikePdf(head)) return "pdf";
  if (detectImageKind(head)) return "image";
  if (HTML_NAME.test(name)) return "html";

  // Markup without an extension: a leading doctype or <html>/<head>/<body>.
  let prefix = "";
  for (let i = 0; i < Math.min(head.length, 256); i++) prefix += String.fromCharCode(head[i]);
  if (HTML_HEAD.test(prefix)) return "html";

  return "document";
}

/** Reads only the first kilobyte, so an oversized file is classified cheaply. */
export async function classifyImportFile(file: File): Promise<ImportKind> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  return classifyBytes(head, file.name);
}

/** Name for a converted document: the original stem with a `.pdf` extension. */
export function importedPdfName(name: string): string {
  const stem = (name || "document").replace(/\.[^.]+$/, "").trim();
  return `${stem || "document"}.pdf`;
}

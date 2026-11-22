import {
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  rgb,
} from "pdf-lib";
import { escapeXml } from "@/lib/security/escape";
import { encodeCommentContents } from "@/lib/security/comments";
import { loadPdfLib, savePdfBytes, stripMetadata } from "@/lib/document/pages";
import { embedAppFont } from "@/lib/text/embedded-fonts";

/** Strips control characters so untrusted text cannot break a drawn text run. */
function cleanText(value: string | undefined, max = 96): string {
  return (value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}

/* XFDF escaping lives in @/lib/security/escape so the export writers and this module share one implementation. */

/** SHA-256 over the exact bytes stamped, via WebCrypto; callers stamp the digest rather than accept a provided one. */
export async function documentFingerprint(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface RedactionBox {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DigitalSignatureInfo {
  signerName: string;
  organization?: string;
  reason?: string;
  location?: string;
  date: string;
  hash: string;
}

export interface CommentThread {
  id: string;
  author: string;
  date: string;
  pageIndex: number;
  text: string;
  type: "sticky" | "highlight" | "underline" | "strikethrough" | "callout";
  status: "Open" | "Accepted" | "Rejected" | "Cancelled";
  replies: Array<{ author: string; text: string; date: string }>;
}

/** Scrubs hidden metadata (author, title, subject, creator, producer, dates). */
export async function scrubPdfMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  stripMetadata(doc);
  return savePdfBytes(doc);
}

/* Redaction lives in ./optimize: pages are rebuilt as pixels so the text under the box is destroyed, not just covered. */

/** Draws an integrity stamp, not a digital signature: no certificate or key is used, only the SHA-256 fingerprint and typed signer details. */
export async function stampDigitalSignature(
  bytes: Uint8Array,
  info: DigitalSignatureInfo,
  pageIndex: number = 0
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const pages = doc.getPages();
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const font = await embedAppFont(doc, { bold: true });
  const regularFont = await embedAppFont(doc);

  const { width } = page.getSize();
  const boxW = 240;
  const boxH = 68;
  const x = width - boxW - 36;
  const y = 36;

  page.drawRectangle({
    x,
    y,
    width: boxW,
    height: boxH,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.04, 0.52, 1.0),
    borderWidth: 1.5,
  });

  // Info badge — deliberately not a checkmark, which would imply verification.
  page.drawRectangle({
    x: x + 8,
    y: y + boxH - 24,
    width: 16,
    height: 16,
    color: rgb(0.04, 0.52, 1.0),
  });
  page.drawText("i", {
    x: x + 13,
    y: y + boxH - 21,
    size: 11,
    font,
    color: rgb(1, 1, 1),
  });

  page.drawText("INTEGRITY STAMP (UNSIGNED)", {
    x: x + 30,
    y: y + boxH - 20,
    size: 8.5,
    font,
    color: rgb(0.04, 0.52, 1.0),
  });

  page.drawText(`Signer: ${cleanText(info.signerName, 48)}`, {
    x: x + 10,
    y: y + 32,
    size: 8,
    font,
    color: rgb(0.1, 0.1, 0.12),
  });

  if (info.organization) {
    page.drawText(`Org: ${cleanText(info.organization, 40)} | Date: ${cleanText(info.date, 24)}`, {
      x: x + 10,
      y: y + 21,
      size: 7,
      font: regularFont,
      color: rgb(0.3, 0.3, 0.35),
    });
  } else {
    page.drawText(`Date: ${cleanText(info.date, 24)}`, {
      x: x + 10,
      y: y + 21,
      size: 7,
      font: regularFont,
      color: rgb(0.3, 0.3, 0.35),
    });
  }

  // SHA-256 fingerprint of the document as it was received.
  page.drawText(`SHA-256: ${cleanText(info.hash, 32)}…`, {
    x: x + 10,
    y: y + 10,
    size: 6.5,
    font: regularFont,
    color: rgb(0.45, 0.45, 0.5),
  });
  page.drawText("Not a digital signature — no certificate or key is used", {
    x: x + 10,
    y: y + 3,
    size: 5.5,
    font: regularFont,
    color: rgb(0.55, 0.55, 0.6),
  });

  return savePdfBytes(doc);
}

const COMMENT_STATUSES = new Set<CommentThread["status"]>([
  "Open",
  "Accepted",
  "Rejected",
  "Cancelled",
]);

const ANYDOC_ANNOTATION_PREFIX = "anydoc:";

/** Writes review threads as standard PDF text notes; only our own `anydoc:` notes are replaced. */
export async function writeCommentsToPdf(
  bytes: Uint8Array,
  comments: CommentThread[]
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const pages = doc.getPages();

  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;

    for (let i = annots.size() - 1; i >= 0; i -= 1) {
      const annotation = annots.lookup(i);
      if (!(annotation instanceof PDFDict)) continue;
      const name = annotation.lookup(PDFName.of("NM"));
      const value =
        name instanceof PDFHexString
          ? name.decodeText()
          : name instanceof PDFString
          ? name.decodeText()
          : "";
      if (value.startsWith(ANYDOC_ANNOTATION_PREFIX)) annots.remove(i);
    }
  }

  for (const comment of comments) {
    const page = pages[Math.min(Math.max(comment.pageIndex, 0), pages.length - 1)];
    if (!page) continue;

    const { width, height } = page.getSize();
    const parsedDate = new Date(comment.date);
    const annotation = doc.context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [width - 36, height - 36, width - 16, height - 16],
      Open: true,
      T: PDFHexString.fromText(comment.author || "Unknown"),
      Contents: PDFHexString.fromText(encodeCommentContents(comment)),
      M: PDFString.fromDate(Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate),
      NM: PDFHexString.fromText(`${ANYDOC_ANNOTATION_PREFIX}${comment.id}`),
      F: PDFNumber.of(4),
      C: [1, 1, 0],
    });

    const annots = page.node.Annots() ?? doc.context.obj([]);
    annots.push(annotation);
    page.node.set(PDFName.of("Annots"), annots);
  }

  return savePdfBytes(doc);
}

/**
 * Imports standard XFDF text annotations. Unknown fields are ignored, enums are
 * validated, and text is length-capped because the file may come from another vendor.
 */
export function importCommentsFromFdf(
  xml: string,
  existing: CommentThread[] = []
): CommentThread[] {
  if (typeof DOMParser === "undefined") return existing;

  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.getElementsByTagName("parsererror").length > 0) return existing;

  const root = parsed.documentElement;
  if (!root || root.localName !== "xfdf") return existing;

  const nodes = Array.from(root.getElementsByTagNameNS("*", "text"));
  const imported: CommentThread[] = [];
  const seen = new Set(existing.map(commentKey));

  for (const node of nodes) {
    const page = Number(node.getAttribute("page") ?? "0");
    const text = cleanText(node.getElementsByTagNameNS("*", "contents")[0]?.textContent, 4000);
    if (!text.trim()) continue;

    const rawStatus = node.getAttribute("status") ?? "Open";
    const status = COMMENT_STATUSES.has(rawStatus as CommentThread["status"])
      ? (rawStatus as CommentThread["status"])
      : "Open";
    const id = node.getAttribute("id") || `xfdf-${page}-${imported.length + 1}`;
    const key = commentKey({
      id,
      author: node.getAttribute("author") ?? "Unknown",
      date: node.getAttribute("date") ?? "",
      pageIndex: page,
      text,
      type: "sticky",
      status,
      replies: [],
    });
    if (seen.has(key)) continue;

    const replies = Array.from(node.getElementsByTagNameNS("*", "reply")).map((reply) => ({
      author: cleanText(reply.getAttribute("author") ?? "Unknown", 80),
      text: cleanText(reply.textContent, 4000),
      date: reply.getAttribute("date") ?? "",
    }));

    imported.push({
      id,
      author: cleanText(node.getAttribute("author") ?? "Unknown", 80),
      date: node.getAttribute("date") ?? "",
      pageIndex:
        Number.isInteger(page) && page >= 0 ? Math.min(page, 1_000_000) : 0,
      text,
      type: "sticky",
      status,
      replies,
    });
    seen.add(key);
  }

  return [...existing, ...imported];
}

function commentKey(comment: CommentThread): string {
  return [comment.id, comment.pageIndex, comment.author, comment.date, comment.text].join("\u0000");
}

/** Exports comment threads to XFDF; every value is escaped and every enum validated because the fields reach another vendor's XML parser. */
export function exportCommentsToFdf(comments: CommentThread[], docName: string): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <f href="${escapeXml(cleanText(docName, 160))}"/>
  <annots>`;

  const body = comments
    .map((c) => {
      const page = Number.isInteger(c.pageIndex) && c.pageIndex >= 0 ? c.pageIndex : 0;
      const status = COMMENT_STATUSES.has(c.status) ? c.status : "Open";
      const replies = (c.replies ?? [])
        .map(
          (reply) =>
            `<reply author="${escapeXml(cleanText(reply.author, 80))}" date="${escapeXml(
              cleanText(reply.date, 40)
            )}">${escapeXml(cleanText(reply.text, 4000))}</reply>`
        )
        .join("");
      return `    <text id="${escapeXml(cleanText(c.id, 120))}" page="${page}" date="${escapeXml(
        cleanText(c.date, 40)
      )}" author="${escapeXml(cleanText(c.author, 80))}" status="${escapeXml(status)}">
      <contents>${escapeXml(cleanText(c.text, 4000))}</contents>${replies}
    </text>`;
    })
    .join("\n");

  const footer = `\n  </annots>
</xfdf>`;

  return header + "\n" + body + footer;
}

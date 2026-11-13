import { rgb, StandardFonts } from "pdf-lib";
import { escapeXml } from "@/lib/security/escape";
import { loadPdfLib, savePdfBytes, stripMetadata } from "@/lib/document/pages";

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
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

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
      return `    <text page="${page}" date="${escapeXml(cleanText(c.date, 40))}" author="${escapeXml(
        cleanText(c.author, 80)
      )}" status="${escapeXml(status)}">
      <contents>${escapeXml(cleanText(c.text, 4000))}</contents>
    </text>`;
    })
    .join("\n");

  const footer = `\n  </annots>
</xfdf>`;

  return header + "\n" + body + footer;
}

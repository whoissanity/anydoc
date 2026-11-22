import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  type PDFDocument,
} from "pdf-lib";
import { loadPdfLib } from "@/lib/document/pages";
import { assertPdfBytes } from "@/lib/document/validate";

export type VerificationStatus = "pass" | "warn" | "fail";

export interface VerificationCheck {
  id: string;
  status: VerificationStatus;
  title: string;
  detail: string;
}

export interface PdfAVerification {
  ok: boolean;
  score: number;
  checks: VerificationCheck[];
  text: string;
  json: string;
}

function ascii(bytes: Uint8Array, limit = 4 * 1024 * 1024): string {
  let out = "";
  const end = Math.min(bytes.byteLength, limit);
  for (let i = 0; i < end; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, end)));
  }
  const tailStart = Math.max(end, bytes.byteLength - 1024 * 1024);
  if (tailStart < bytes.byteLength) {
    for (let i = tailStart; i < bytes.byteLength; i += 0x8000) {
      out += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.byteLength)));
    }
  }
  return out;
}

function statusPenalty(status: VerificationStatus): number {
  if (status === "fail") return 30;
  if (status === "warn") return 10;
  return 0;
}

function fontScan(doc: PDFDocument): { fonts: number; embedded: number; missing: number } {
  let fonts = 0;
  let embedded = 0;
  let missing = 0;
  const seen = new Set<string>();

  for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
    const resources = doc.getPage(pageIndex).node.Resources();
    const fontDict = resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (!fontDict) continue;

    for (const [name, ref] of fontDict.entries()) {
      const key = ref.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      fonts += 1;

      const font = doc.context.lookup(ref);
      if (!(font instanceof PDFDict)) continue;
      const descriptor = font.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
      const file =
        descriptor?.lookup(PDFName.of("FontFile")) ??
        descriptor?.lookup(PDFName.of("FontFile2")) ??
        descriptor?.lookup(PDFName.of("FontFile3"));
      if (file instanceof PDFRawStream) embedded += 1;
      else missing += 1;

      void name;
    }
  }

  return { fonts, embedded, missing };
}

export async function verifyPdfA(bytes: Uint8Array): Promise<PdfAVerification> {
  assertPdfBytes(bytes);
  const checks: VerificationCheck[] = [];
  const add = (
    id: string,
    status: VerificationStatus,
    title: string,
    detail: string
  ) => {
    checks.push({ id, status, title, detail });
  };

  const sample = ascii(bytes);
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 8));
  if (header.startsWith("%PDF-")) {
    const version = Number(header.slice(5).trim());
    add(
      "header",
      version >= 1.4 ? "pass" : "fail",
      "PDF header",
      `PDF version ${header.slice(5).trim() || "unknown"}`
    );
  } else {
    add("header", "fail", "PDF header", "The file does not start with %PDF-");
  }

  if (sample.includes("%%EOF") && sample.includes("startxref")) {
    add("structure", "pass", "Trailer and cross-reference", "%%EOF and startxref are present");
  } else {
    add("structure", "warn", "Trailer and cross-reference", "%%EOF or startxref is missing");
  }

  let doc: PDFDocument;
  try {
    doc = await loadPdfLib(bytes);
  } catch (error) {
    add(
      "parse",
      "fail",
      "PDF parse",
      error instanceof Error ? error.message : "The PDF could not be parsed"
    );
    return finalize(checks);
  }

  const catalog = doc.catalog;
  const intents = catalog.lookupMaybe(PDFName.of("OutputIntents"), PDFArray);
  const firstRef = intents && intents.size() > 0 ? intents.get(0) : undefined;
  const firstIntent = firstRef ? doc.context.lookup(firstRef) : undefined;
  if (firstIntent instanceof PDFDict) {
    const subtype = firstIntent.lookup(PDFName.of("S"));
    const profile =
      firstIntent.lookup(PDFName.of("DestOutputProfile")) instanceof PDFRawStream
        ? (firstIntent.lookup(PDFName.of("DestOutputProfile")) as PDFRawStream)
        : undefined;
    const profileOk =
      profile &&
      profile.dict.get(PDFName.of("N"))?.toString() === "3" &&
      profile.getContents().subarray(36, 40).toString() === "97,99,115,112";
    add(
      "outputIntent",
      subtype?.toString() === "/GTS_PDFA1" && profileOk ? "pass" : "warn",
      "PDF/A output intent",
      profileOk
        ? `${subtype?.toString() ?? "missing"} with an sRGB ICC profile`
        : "An output intent exists but the ICC profile is missing or invalid"
    );
  } else {
    add("outputIntent", "fail", "PDF/A output intent", "No OutputIntents array or profile");
  }

  const metadata = catalog.lookup(PDFName.of("Metadata"));
  if (metadata instanceof PDFRawStream) {
    const xmp = metadata.getContentsString();
    const part = /<pdfaid:part>\s*(\d+)\s*<\/pdfaid:part>/.exec(xmp)?.[1];
    const conformance = /<pdfaid:conformance>\s*([AB])\s*<\/pdfaid:conformance>/.exec(xmp)?.[1];
    add(
      "xmp",
      part && conformance ? "pass" : "warn",
      "PDF/A XMP metadata",
      part && conformance
        ? `pdfaid:part=${part}, pdfaid:conformance=${conformance}`
        : "XMP metadata is missing pdfaid:part or pdfaid:conformance"
    );
  } else {
    add("xmp", "fail", "PDF/A XMP metadata", "No XMP metadata stream");
  }

  if (doc.isEncrypted || sample.includes("/Encrypt")) {
    add("encryption", "fail", "Encryption", "The file is encrypted; PDF/A requires an unencrypted file");
  } else {
    add("encryption", "pass", "Encryption", "The file is not encrypted");
  }

  const hasScript =
    catalog.has(PDFName.of("OpenAction")) ||
    catalog.has(PDFName.of("AA")) ||
    catalog.has(PDFName.of("JavaScript")) ||
    sample.includes("/JavaScript") ||
    sample.includes("/Launch") ||
    sample.includes("/SubmitForm");
  add(
    "scripts",
    hasScript ? "fail" : "pass",
    "JavaScript and actions",
    hasScript
      ? "JavaScript, OpenAction, AA, Launch or SubmitForm was detected"
      : "No JavaScript or launch actions detected"
  );

  const form = catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (form?.has(PDFName.of("XFA"))) {
    add("xfa", "fail", "XFA forms", "XFA is not permitted in PDF/A");
  } else {
    add("xfa", "pass", "XFA forms", "No XFA form stream");
  }

  const fonts = fontScan(doc);
  if (fonts.missing === 0) {
    add(
      "fonts",
      "pass",
      "Font embedding",
      `${fonts.embedded} of ${fonts.fonts} font program(s) embedded`
    );
  } else {
    add(
      "fonts",
      "fail",
      "Font embedding",
      `${fonts.missing} of ${fonts.fonts} font program(s) are not embedded`
    );
  }

  if (sample.includes("/EmbeddedFile")) {
    add(
      "attachments",
      "warn",
      "Embedded files",
      "Embedded files are present; PDF/A-2b allows them, but PDF/A-1 does not"
    );
  } else {
    add("attachments", "pass", "Embedded files", "No embedded files detected");
  }

  return finalize(checks);
}

function finalize(checks: VerificationCheck[]): PdfAVerification {
  const penalty = checks.reduce((sum, check) => sum + statusPenalty(check.status), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const ok = checks.every((check) => check.status !== "fail");
  const text = checks
    .map((check) => `${check.status.toUpperCase()} · ${check.title} — ${check.detail}`)
    .join("\n");
  return {
    ok,
    score,
    checks,
    text,
    json: JSON.stringify({ ok, score, checks }, null, 2),
  };
}

export function verificationReport(
  verification: PdfAVerification,
  format: "text" | "json"
): string {
  return format === "json" ? verification.json : verification.text;
}
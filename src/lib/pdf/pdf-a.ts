import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
  type PDFDocument,
} from "pdf-lib";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";
import { assertPdfBytes } from "@/lib/document/validate";

export interface FontAuditEntry {
  page: number;
  name: string;
  embedded: boolean;
  kind?: string;
  glyphs?: number;
  error?: string;
}

export interface FontAudit {
  entries: FontAuditEntry[];
  embedded: number;
  missing: number;
  invalid: number;
  checked: number;
}

export interface PdfAPrepOptions {
  stripJavaScript?: boolean;
  title?: string;
  author?: string;
}

export interface PdfAPrepResult {
  bytes: Uint8Array;
  checklist: string[];
  warnings: string[];
  fontAudit: FontAudit;
}

interface FontLike {
  numGlyphs: number;
}

interface FontkitModule {
  create(buffer: Uint8Array, postscriptName?: string): FontLike;
}

let fontkitPromise: Promise<FontkitModule | null> | null = null;

async function loadFontkit(): Promise<FontkitModule | null> {
  if (!fontkitPromise) {
    fontkitPromise = import("@pdf-lib/fontkit")
      .then((module) => {
        const candidate = (module as { default?: FontkitModule }).default ?? module;
        return (candidate as FontkitModule).create ? (candidate as FontkitModule) : null;
      })
      .catch(() => null);
  }
  return fontkitPromise;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmpDate(value: Date | undefined): string | undefined {
  return value && !Number.isNaN(value.getTime()) ? value.toISOString() : undefined;
}

function xmpPacket(
  title: string,
  author: string,
  producer: string,
  created: Date | undefined,
  modified: Date | undefined
): string {
  const createdDate = xmpDate(created);
  const modifiedDate = xmpDate(modified);
  const titleXml = title
    ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>`
    : "";
  const authorXml = author
    ? `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(author)}</rdf:li></rdf:Seq></dc:creator>`
    : "";
  const createdXml = createdDate ? `<xmp:CreateDate>${createdDate}</xmp:CreateDate>` : "";
  const modifiedXml = modifiedDate ? `<xmp:ModifyDate>${modifiedDate}</xmp:ModifyDate>` : "";
  const metadataDateXml = modifiedDate
    ? `<xmp:MetadataDate>${modifiedDate}</xmp:MetadataDate>`
    : "";
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="AnyDoc">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <pdf:Producer>${xmlEscape(producer)}</pdf:Producer>
   <xmp:CreatorTool>AnyDoc PDF/A</xmp:CreatorTool>
   ${createdXml}
   ${modifiedXml}
   ${metadataDateXml}
   <pdfaid:part>2</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
   ${titleXml}
   ${authorXml}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

let iccPromise: Promise<Uint8Array> | null = null;

function loadSrgbProfile(): Promise<Uint8Array> {
  if (!iccPromise) {
    iccPromise = (async () => {
      if (typeof fetch !== "function") {
        throw new Error("Output intent loading requires fetch");
      }
      const response = await fetch("/vendor/icc/srgb.icc");
      if (!response.ok) {
        throw new Error(`Could not load sRGB ICC profile (${response.status})`);
      }
      return new Uint8Array(await response.arrayBuffer());
    })();
  }
  return iccPromise;
}

async function addOutputIntent(doc: PDFDocument, checklist: string[]): Promise<void> {
  const profile = await loadSrgbProfile();
  const profileStream = doc.context.stream(profile, { N: 3 });
  const profileRef = doc.context.register(profileStream);
  const intent = doc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    RegistryName: PDFString.of("http://www.color.org"),
    DestOutputProfile: profileRef,
  });

  const catalog = doc.catalog;
  catalog.set(PDFName.of("OutputIntents"), doc.context.obj([intent]));
  checklist.push("sRGB output intent injected");
}

function updateXmp(
  doc: PDFDocument,
  title: string,
  author: string,
  producer: string,
  created: Date | undefined,
  modified: Date | undefined,
  checklist: string[]
): void {
  const catalog = doc.catalog;
  const existing = catalog.has(PDFName.of("Metadata"));
  catalog.delete(PDFName.of("Metadata"));
  const stream = doc.context.stream(xmpPacket(title, author, producer, created, modified), {
    Type: "Metadata",
    Subtype: "XML",
  });
  const ref = doc.context.register(stream);
  catalog.set(PDFName.of("Metadata"), ref);
  checklist.push(existing ? "XMP metadata replaced with PDF/A-2b metadata" : "PDF/A-2b XMP metadata added");
}

function isJavaScriptAction(action: PDFDict | undefined): boolean {
  if (!action) return false;
  if (action.has(PDFName.of("JS")) || action.has(PDFName.of("JavaScript"))) return true;
  const type = action.lookup(PDFName.of("S"));
  return type instanceof PDFName && type.toString() === "/JavaScript";
}

function stripScripts(doc: PDFDocument, checklist: string[]): void {
  const catalog = doc.catalog;
  const removed: string[] = [];

  for (const key of ["OpenAction", "AA", "JavaScript", "JS"] as const) {
    if (catalog.has(PDFName.of(key))) {
      catalog.delete(PDFName.of(key));
      removed.push(key);
    }
  }

  const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  if (names) {
    if (names.has(PDFName.of("JavaScript"))) {
      names.delete(PDFName.of("JavaScript"));
      removed.push("Names/JavaScript");
    }
    if (names.keys().length === 0) catalog.delete(PDFName.of("Names"));
  }

  const pages = doc.getPages();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (page.node.has(PDFName.of("AA"))) {
      page.node.delete(PDFName.of("AA"));
      removed.push(`page ${pageIndex + 1} AA`);
    }
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let index = 0; index < annots.size(); index += 1) {
      const annot = doc.context.lookup(annots.get(index));
      if (!(annot instanceof PDFDict)) continue;
      const action = annot.lookupMaybe(PDFName.of("A"), PDFDict);
      if (isJavaScriptAction(action)) {
        annot.delete(PDFName.of("A"));
        removed.push(`page ${pageIndex + 1} JavaScript annotation`);
      }
      if (annot.has(PDFName.of("AA"))) {
        annot.delete(PDFName.of("AA"));
        removed.push(`page ${pageIndex + 1} annotation AA`);
      }
    }
  }

  checklist.push(
    removed.length
      ? `JavaScript and launch actions removed: ${removed.join(", ")}`
      : "No JavaScript or launch actions found"
  );
}

function removeXfa(doc: PDFDocument, checklist: string[]): void {
  const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (form?.has(PDFName.of("XFA"))) {
    form.delete(PDFName.of("XFA"));
    checklist.push("XFA form stream removed");
  }
}

async function auditFonts(doc: PDFDocument): Promise<FontAudit> {
  const entries: FontAuditEntry[] = [];
  const seen = new Set<string>();
  const fontkit = await loadFontkit();

  for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
    const page = doc.getPage(pageIndex);
    const resources = page.node.Resources();
    const fonts = resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (!fonts) continue;

    for (const [name, ref] of fonts.entries()) {
      const key = ref instanceof Object ? String(ref) : `${pageIndex}:${name.toString()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const font = doc.context.lookup(ref);
      if (!(font instanceof PDFDict)) continue;
      const descriptor = font.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
      let kind: string | undefined;
      let stream: PDFRawStream | undefined;
      if (descriptor) {
        for (const candidate of ["FontFile", "FontFile2", "FontFile3"] as const) {
          const value = descriptor.lookup(PDFName.of(candidate));
          if (value instanceof PDFRawStream) {
            kind = candidate;
            stream = value;
            break;
          }
        }
      }

      if (!stream) {
        entries.push({ page: pageIndex + 1, name: name.toString(), embedded: false });
        continue;
      }

      let glyphs: number | undefined;
      let error: string | undefined;
      if (fontkit) {
        try {
          let fontBytes: Uint8Array;
          try {
            fontBytes = decodePDFRawStream(stream).decode();
          } catch {
            fontBytes = stream.getContents();
          }
          const parsed = fontkit.create(fontBytes);
          glyphs = parsed.numGlyphs;
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
        }
      }

      entries.push({
        page: pageIndex + 1,
        name: name.toString(),
        embedded: true,
        kind,
        glyphs,
        error,
      });
    }
  }

  const embedded = entries.filter((entry) => entry.embedded).length;
  const missing = entries.filter((entry) => !entry.embedded).length;
  const invalid = entries.filter((entry) => entry.error).length;
  return { entries, embedded, missing, invalid, checked: entries.length };
}

export async function preparePdfA(
  bytes: Uint8Array,
  options: PdfAPrepOptions = {}
): Promise<PdfAPrepResult> {
  assertPdfBytes(bytes);

  let doc: PDFDocument;
  try {
    doc = await loadPdfLib(bytes);
  } catch {
    throw new Error(
      "This PDF could not be opened. It may be corrupt or use an unsupported compression scheme — repair it or export a fresh copy first."
    );
  }
  // pdf-lib cannot decrypt streams, and loadPdfLib deliberately ignores the
  // encryption flag so the viewer can read metadata. Preparing an encrypted
  // file would produce a structurally invalid "archival" copy instead.
  if (doc.isEncrypted) {
    throw new Error(
      "This PDF is encrypted. Save an unlocked copy (remove the open password) before preparing it for archival."
    );
  }

  const checklist: string[] = [];
  const warnings: string[] = [];

  const title = (options.title ?? doc.getTitle() ?? "").trim();
  const author = (options.author ?? doc.getAuthor() ?? "").trim();
  if (title) doc.setTitle(title);
  if (author) doc.setAuthor(author);
  doc.setProducer("AnyDoc PDF/A");
  doc.setCreator("AnyDoc");
  doc.setModificationDate(new Date());

  const producer = doc.getProducer() ?? "AnyDoc PDF/A";
  const created = doc.getCreationDate();
  const modified = doc.getModificationDate();

  try {
    await addOutputIntent(doc, checklist);
    updateXmp(doc, title, author, producer, created, modified, checklist);
    removeXfa(doc, checklist);

    if (options.stripJavaScript) {
      stripScripts(doc, checklist);
    } else {
      checklist.push("JavaScript stripping left off — enable it for strict PDF/A");
      warnings.push(
        "JavaScript and interactive scripts were kept. Strict PDF/A requires removing them; auto-calculating forms may break."
      );
    }
  } catch {
    throw new Error(
      "This PDF's structure could not be rewritten for archival. It may use unsupported or malformed objects — repair it and try again."
    );
  }

  const fontAudit = await auditFonts(doc);
  checklist.push(
    `Font programs audited: ${fontAudit.embedded} embedded, ${fontAudit.missing} missing, ${fontAudit.invalid} invalid`
  );
  if (fontAudit.missing) {
    warnings.push(
      `${fontAudit.missing} font program(s) are not embedded. They cannot be embedded without the source font; install the font and re-export, or convert the affected text to outlines.`
    );
  }
  if (fontAudit.invalid) {
    warnings.push(`${fontAudit.invalid} embedded font program(s) could not be parsed by fontkit.`);
  }

  return { bytes: await savePdfBytes(doc), checklist, warnings, fontAudit };
}
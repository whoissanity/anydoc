import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { preparePdfA } from "@/lib/pdf/pdf-a";

async function basePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Archival test");
  doc.setAuthor("AnyDoc");
  doc.addPage([300, 200]);
  return doc.save();
}

describe("preparePdfA", () => {
  it("adds an sRGB output intent and PDF/A XMP metadata", async () => {
    const result = await preparePdfA(await basePdf(), { stripJavaScript: false });

    expect(result.checklist.join(" ")).toMatch(/sRGB output intent injected/);
    expect(result.checklist.join(" ")).toMatch(/XMP metadata/);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder("latin1").decode(result.bytes.subarray(0, 5))).toBe("%PDF-");

    const prepared = await PDFDocument.load(result.bytes);
    const intents = prepared.catalog.lookup(PDFName.of("OutputIntents"), PDFArray);
    expect(intents.size()).toBe(1);
    const intent = prepared.context.lookup(intents.get(0));
    expect(intent).toBeInstanceOf(PDFDict);
    expect((intent as PDFDict).lookup(PDFName.of("S"))?.toString()).toBe("/GTS_PDFA1");

    const profile = (intent as PDFDict).lookup(PDFName.of("DestOutputProfile"));
    expect(profile).toBeInstanceOf(PDFRawStream);
    const icc = (profile as PDFRawStream).getContents();
    expect(Array.from(icc.subarray(36, 40))).toEqual([0x61, 0x63, 0x73, 0x70]);

    const metadata = prepared.catalog.lookup(PDFName.of("Metadata"));
    expect(metadata).toBeInstanceOf(PDFRawStream);
    const xmp = (metadata as PDFRawStream).getContentsString();
    expect(xmp).toMatch(/<pdfaid:part>2<\/pdfaid:part>/);
    expect(xmp).toMatch(/<pdfaid:conformance>B<\/pdfaid:conformance>/);
  });

  it("uses the vendored sRGB ICC profile for the output intent", async () => {
    const result = await preparePdfA(await basePdf(), { stripJavaScript: false });
    const prepared = await PDFDocument.load(result.bytes);
    const intents = prepared.catalog.lookup(PDFName.of("OutputIntents"), PDFArray);
    const intent = prepared.context.lookup(intents.get(0)) as PDFDict;
    const profile = intent.lookup(PDFName.of("DestOutputProfile")) as PDFRawStream;
    const vendored = new Uint8Array(await (await fetch("/vendor/icc/srgb.icc")).arrayBuffer());

    expect(profile.dict.get(PDFName.of("N"))?.toString()).toBe("3");
    expect(profile.getContents().byteLength).toBe(vendored.byteLength);
    expect(Array.from(profile.getContents())).toEqual(Array.from(vendored));
  });

  it("copies Title, Author and dates from the Info dictionary into XMP", async () => {
    const doc = await PDFDocument.create();
    doc.setTitle("Archival test");
    doc.setAuthor("AnyDoc");
    doc.setCreationDate(new Date("2024-01-02T03:04:05Z"));
    doc.addPage([300, 200]);
    const source = await doc.save();

    const result = await preparePdfA(source, { stripJavaScript: false });
    const prepared = await PDFDocument.load(result.bytes);
    const metadata = prepared.catalog.lookup(PDFName.of("Metadata"));
    expect(metadata).toBeInstanceOf(PDFRawStream);
    const xmp = (metadata as PDFRawStream).getContentsString();

    const created = prepared.getCreationDate()?.toISOString();
    const modified = prepared.getModificationDate()?.toISOString();
    expect(created).toBeDefined();
    expect(modified).toBeDefined();
    expect(xmp).toContain("<dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">Archival test</rdf:li></rdf:Alt></dc:title>");
    expect(xmp).toContain("<dc:creator><rdf:Seq><rdf:li>AnyDoc</rdf:li></rdf:Seq></dc:creator>");
    expect(xmp).toContain(`<xmp:CreateDate>${created}</xmp:CreateDate>`);
    expect(xmp).toContain(`<xmp:ModifyDate>${modified}</xmp:ModifyDate>`);
  });

  it("keeps JavaScript when the opt-in is off and warns", async () => {
    const doc = await PDFDocument.load(await basePdf());
    doc.catalog.set(PDFName.of("OpenAction"), doc.context.obj({ Type: "Action", S: "JavaScript" }));
    const bytes = await doc.save();

    const result = await preparePdfA(bytes, { stripJavaScript: false });
    expect(result.warnings.join(" ")).toMatch(/JavaScript and interactive scripts were kept/);

    const prepared = await PDFDocument.load(result.bytes);
    expect(prepared.catalog.has(PDFName.of("OpenAction"))).toBe(true);
  });

  it("removes JavaScript and actions when the user opts in", async () => {
    const doc = await PDFDocument.load(await basePdf());
    doc.catalog.set(PDFName.of("OpenAction"), doc.context.obj({ Type: "Action", S: "JavaScript" }));
    doc.catalog.set(PDFName.of("AA"), doc.context.obj({}));
    const bytes = await doc.save();

    const result = await preparePdfA(bytes, { stripJavaScript: true });
    expect(result.checklist.join(" ")).toMatch(/JavaScript and launch actions removed/);

    const prepared = await PDFDocument.load(result.bytes);
    expect(prepared.catalog.has(PDFName.of("OpenAction"))).toBe(false);
    expect(prepared.catalog.has(PDFName.of("AA"))).toBe(false);
  });

  it("preserves interactive forms when JavaScript stripping is off", async () => {
    const doc = await PDFDocument.load(await basePdf());
    const form = doc.getForm();
    form.createTextField("customer").addToPage(doc.getPage(0), {
      x: 20,
      y: 20,
      width: 120,
      height: 20,
    });
    const bytes = await doc.save();

    const result = await preparePdfA(bytes, { stripJavaScript: false });
    const prepared = await PDFDocument.load(result.bytes);

    expect(prepared.catalog.has(PDFName.of("AcroForm"))).toBe(true);
    expect(prepared.getForm().getFields().map((field) => field.getName())).toEqual(["customer"]);
  });

  it("purges the JavaScript names tree when the opt-in is on", async () => {
    const doc = await PDFDocument.load(await basePdf());
    doc.catalog.set(
      PDFName.of("Names"),
      doc.context.obj({ JavaScript: doc.context.obj({ Names: doc.context.obj([]) }) })
    );
    const bytes = await doc.save();

    const result = await preparePdfA(bytes, { stripJavaScript: true });
    const prepared = await PDFDocument.load(result.bytes);

    expect(prepared.catalog.has(PDFName.of("Names"))).toBe(false);
    expect(result.checklist.join(" ")).toMatch(/Names\/JavaScript/);
  });

  it("fails gracefully on a corrupt PDF", async () => {
    const corrupt = new TextEncoder().encode("%PDF-1.7\nthis is not a real document");
    await expect(preparePdfA(corrupt)).rejects.toThrow(/could not be opened/);
  });

  it("rejects empty input", async () => {
    await expect(preparePdfA(new Uint8Array(0))).rejects.toThrow(/empty or detached/);
  });
});
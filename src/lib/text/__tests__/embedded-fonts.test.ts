import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createPdfFromText } from "@/lib/document/pages";
import { renderTextPdf } from "@/lib/document/text-to-pdf";
import { addTextStamp } from "@/lib/document/optimize";
import { applyTextEdit } from "@/lib/edit/edit-engine";
import { applyAnnotationsToPdf } from "@/lib/edit/annotate";
import { addPageNumbers } from "@/lib/edit/marks";
import { embedFormFields } from "@/lib/edit/forms";
import type { StickyNoteItem, TextEditSession } from "@/lib/types";

async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  return doc.save();
}

function fontFile(font: PDFDict): PDFRawStream | undefined {
  const descriptor = font.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
  const direct =
    descriptor?.lookup(PDFName.of("FontFile")) ??
    descriptor?.lookup(PDFName.of("FontFile2")) ??
    descriptor?.lookup(PDFName.of("FontFile3"));
  if (direct instanceof PDFRawStream) return direct;

  const descendants = font.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
  const first = descendants?.lookup(0);
  if (!(first instanceof PDFDict)) return undefined;
  const childDescriptor = first.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
  const child =
    childDescriptor?.lookup(PDFName.of("FontFile")) ??
    childDescriptor?.lookup(PDFName.of("FontFile2")) ??
    childDescriptor?.lookup(PDFName.of("FontFile3"));
  return child instanceof PDFRawStream ? child : undefined;
}

async function fontPrograms(bytes: Uint8Array): Promise<
  Array<{ embedded: boolean; subtype: string; baseFont: string }>
> {
  const doc = await PDFDocument.load(bytes);
  const seen = new Set<string>();
  const programs: Array<{ embedded: boolean; subtype: string; baseFont: string }> = [];

  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    const key = ref.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(object instanceof PDFDict)) continue;
    const type = object.lookup(PDFName.of("Type"))?.toString();
    if (type !== "/Font" && !object.has(PDFName.of("BaseFont"))) continue;
    programs.push({
      embedded: fontFile(object) !== undefined,
      subtype: object.lookup(PDFName.of("Subtype"))?.toString() ?? "",
      baseFont: object.lookup(PDFName.of("BaseFont"))?.toString() ?? "",
    });
  }
  return programs;
}

function expectEmbeddedOnly(bytes: Uint8Array, label: string) {
  const programs = fontPrograms(bytes);
  return programs.then((fonts) => {
    expect(fonts.length, label).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.embedded, label).toBe(true);
      expect(font.subtype, label).not.toBe("/Type1");
      expect(font.baseFont, label).not.toMatch(/Helvetica|TimesRoman|Courier/);
    }
    return fonts;
  });
}

describe("embedded app fonts", () => {
  it("embeds a font program in every PDF writer call site", async () => {
    const base = await blankPdf();

    const outputs: Array<[string, Uint8Array]> = [
      ["pages.createPdfFromText", await createPdfFromText("hello", "Test")],
      ["text-to-pdf.renderTextPdf", await renderTextPdf("hello", "Test")],
      [
        "optimize.addTextStamp",
        await addTextStamp(base, {
          text: "APPROVED",
          color: "#ff0000",
          opacity: 0.8,
          fontSize: 14,
          rotation: 0,
          border: false,
        }),
      ],
      [
        "edit-engine.applyTextEdit",
        await applyTextEdit(base, {
          id: "text-1",
          pageIndex: 0,
          text: "hello",
          x: 20,
          y: 20,
          width: 120,
          height: 20,
          fontSize: 12,
          fontFamily: "Arial",
          color: "#000000",
        } satisfies TextEditSession),
      ],
      [
        "annotate.applyAnnotationsToPdf",
        await applyAnnotationsToPdf(
          base,
          [],
          [
            {
              id: "note-1",
              pageIndex: 0,
              x: 20,
              y: 20,
              text: "hello",
              author: "AnyDoc",
              date: "2026-11-15",
            } satisfies StickyNoteItem,
          ],
          { opacity: 1 }
        ),
      ],
      [
        "marks.addPageNumbers",
        await addPageNumbers(base, {
          format: "{n}",
          position: "bottom-center",
          marginX: 20,
          marginY: 20,
          fontSize: 10,
          family: "Helvetica",
          bold: false,
          color: "#000000",
          opacity: 1,
          startNumber: 1,
          startPage: 0,
          skipFirstPage: false,
        }),
      ],
      [
        "forms.embedFormFields",
        await embedFormFields(base, [
          {
            id: "field-1",
            name: "name",
            type: "text",
            pageIndex: 0,
            x: 20,
            y: 20,
            width: 120,
            height: 20,
            value: "hello",
          },
        ]),
      ],
    ];

    for (const [name, bytes] of outputs) {
      const fonts = await expectEmbeddedOnly(bytes, name);
      expect(fonts.map((font) => font.baseFont).join(" "), name).toContain("LiberationSans");
    }
  });
});
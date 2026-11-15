import { readFile } from "node:fs/promises";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTextPdf } from "@/lib/document/text-to-pdf";
import { createPdfFromText } from "@/lib/document/pages";
import { embedAppFont } from "@/lib/text/embedded-fonts";
import { resetScriptSessionCache } from "@/lib/fonts/scripts";

function fontFile(font: PDFDict): PDFRawStream | undefined {
  const descriptor = font.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
  const direct =
    descriptor?.lookup(PDFName.of("FontFile")) ??
    descriptor?.lookup(PDFName.of("FontFile2")) ??
    descriptor?.lookup(PDFName.of("FontFile3"));
  return direct instanceof PDFRawStream ? direct : undefined;
}

async function baseFonts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const names: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (object.lookup(PDFName.of("Type"))?.toString() !== "/Font" && !object.has(PDFName.of("BaseFont"))) {
      continue;
    }
    if (!fontFile(object) && !(object.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray))) {
      // Still record BaseFont for Type0 wrappers.
    }
    const base = object.lookup(PDFName.of("BaseFont"))?.toString() ?? "";
    if (base) names.push(base);
  }
  return names;
}

describe("embedAppFont family selection", () => {
  it("embeds Liberation Serif / Mono for serif and mono requests", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    await embedAppFont(doc, { family: "serif", name: "Times New Roman" });
    await embedAppFont(doc, { family: "mono", name: "Courier New" });
    const bytes = await doc.save();
    const names = (await baseFonts(bytes)).join(" ");
    expect(names).toMatch(/LiberationSerif/);
    expect(names).toMatch(/LiberationMono/);
  });

  it("embeds Liberation Sans for Arial via the name map", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    await embedAppFont(doc, { name: "Arial" });
    const bytes = await doc.save();
    expect((await baseFonts(bytes)).join(" ")).toMatch(/LiberationSans/);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetScriptSessionCache();
  });

  it("lazy-loads and embeds the matching script pack for Japanese text", async () => {
    const bytes = new Uint8Array(
      await readFile("public/vendor/fonts/scripts/NotoSansJP-Regular.otf")
    );
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input).includes("/vendor/fonts/scripts/NotoSansJP-Regular.otf")) {
        return new Response(bytes, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });

    const pdf = await renderTextPdf("日本語です", "Japanese");
    expect((await baseFonts(pdf)).join(" ")).toMatch(/NotoSansJP/);
  });

  it("selects the script face per line for mixed Latin/Japanese/Arabic text", async () => {
    const pdf = await createPdfFromText(
      "Hello world\n日本語です\nسلام عليكم",
      "Mixed scripts"
    );
    const names = (await baseFonts(pdf)).join(" ");
    expect(names).toMatch(/LiberationSans/);
    expect(names).toMatch(/NotoSansJP/);
    expect(names).toMatch(/NotoSansArabic/);
  });
});

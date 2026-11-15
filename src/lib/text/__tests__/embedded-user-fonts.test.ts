import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { embedAppFont } from "@/lib/text/embedded-fonts";
import { addUserFont, clearUserFonts } from "@/lib/fonts/user-fonts";
import { resetScriptSessionCache } from "@/lib/fonts/scripts";

describe("user font embedding", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    resetScriptSessionCache();
    await clearUserFonts();
  });

  it("embeds a user-added WOFF2 font as a decodable program in the PDF", async () => {
    const woff2Bytes = new Uint8Array(
      await readFile("public/vendor/fonts/host-grotesk-latin.woff2")
    );
    const file = new File([woff2Bytes], "HostGrotesk-Latin.woff2", {
      type: "font/woff2",
    });
    const record = await addUserFont(file);
    expect(record.format).toBe("woff2");

    const doc = await PDFDocument.create();
    doc.addPage([400, 300]);
    await embedAppFont(doc, { name: "Host Grotesk" });
    const bytes = await doc.save();

    // Reload and find the embedded font program stream.
    const reloaded = await PDFDocument.load(bytes);
    let stream: PDFRawStream | undefined;
    for (const [, object] of reloaded.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) continue;
      const descriptor = object.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
      if (!descriptor) continue;
      for (const candidate of ["FontFile", "FontFile2", "FontFile3"] as const) {
        const value = descriptor.lookup(PDFName.of(candidate));
        if (value instanceof PDFRawStream) {
          stream = value;
          break;
        }
      }
      if (stream) break;
    }
    expect(stream, "expected an embedded font program stream").toBeDefined();

    // The stream must be a fontkit-decodable program (TTF/OTF/CFF), not raw WOFF.
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const decoded = decodePDFRawStream(stream!).decode();
    const parsed = fontkit.create(decoded);
    expect(parsed.numGlyphs).toBeGreaterThan(0);
  });
});
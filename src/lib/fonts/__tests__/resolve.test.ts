import { describe, expect, it } from "vitest";
import { FONTLESS_EXTENSIONS, GENERIC_FALLBACK_NOTICE } from "@/lib/fonts/catalog";
import { resolveFontSync } from "@/lib/fonts/resolve";
import { detectScripts } from "@/lib/fonts/scripts";
import {
  forgetRegisteredUserFont,
  rememberRegisteredUserFont,
} from "@/lib/fonts/registered-user";
import { mapPdfFontToCss } from "@/lib/text/fonts";

describe("font resolver", () => {
  it("maps common commercial sans names onto Liberation Sans", () => {
    for (const name of ["Arial", "Helvetica", "Calibri", "Segoe UI"]) {
      const resolved = resolveFontSync({ name });
      expect(resolved.familyId).toBe("liberation-sans");
      expect(resolved.tier).toBe("name-map");
      expect(resolved.embedUrl).toContain("LiberationSans");
    }
  });

  it("maps serif and mono commercial names onto Liberation faces", () => {
    expect(resolveFontSync({ name: "Times New Roman" }).familyId).toBe("liberation-serif");
    expect(resolveFontSync({ name: "Courier New" }).familyId).toBe("liberation-mono");
    expect(resolveFontSync({ name: "Georgia", bold: true }).embedUrl).toContain("LiberationSerif-Bold");
  });

  it("uses descriptor flags when the name is unknown", () => {
    const mono = resolveFontSync({
      name: "CompletelyUnknownFace",
      descriptor: { fixedPitch: true },
    });
    expect(mono.tier).toBe("descriptor");
    expect(mono.familyId).toBe("liberation-mono");

    const serif = resolveFontSync({
      name: "WeirdCustom",
      descriptor: { serif: true },
    });
    expect(serif.familyId).toBe("liberation-serif");
  });

  it("falls back to generic sans with an honesty notice", () => {
    const resolved = resolveFontSync({ name: "XQZ-PrivateDisplay-9000" });
    expect(resolved.tier).toBe("generic-fallback");
    expect(resolved.familyId).toBe("liberation-sans");
    expect(resolved.notice).toBe(GENERIC_FALLBACK_NOTICE);
    expect(resolved.substituted).toBe(true);
  });

  it("treats document-embedded names as an embedded hit", () => {
    const resolved = resolveFontSync({
      name: "MyEmbeddedFace",
      embeddedNames: ["ABCDE+MyEmbeddedFace"],
    });
    expect(resolved.tier).toBe("embedded");
    expect(resolved.substituted).toBe(false);
  });

  it("always returns a usable CSS stack from mapPdfFontToCss", () => {
    expect(mapPdfFontToCss("ArialMT")).toContain("Liberation Sans");
    expect(mapPdfFontToCss(undefined)).toContain("Liberation Sans");
  });

  it("detects exactly the script packs the text needs", () => {
    expect(detectScripts("سلام")).toEqual(["arabic"]);
    expect(detectScripts("नमस्ते")).toEqual(["devanagari"]);
    expect(detectScripts("日本語")).toEqual(["cjk-jp"]);
    expect(detectScripts("日本語です")).toEqual(["cjk-jp"]);
    expect(detectScripts("한글")).toEqual(["cjk-kr"]);
    expect(detectScripts("汉字")).toEqual(["cjk-sc"]);
    expect(detectScripts("plain latin")).toEqual([]);
  });

  it("adds lazy script families to every substitute stack", () => {
    const stack = mapPdfFontToCss("Arial");
    expect(stack).toContain("Liberation Sans");
    expect(stack).toContain("Noto Sans JP");
    expect(stack).toContain("Noto Sans Arabic");
    expect(stack).toContain("sans-serif");
  });

  it("puts a registered user font ahead of the substitute on screen", () => {
    rememberRegisteredUserFont("test-user", "My Office Face");
    try {
      expect(mapPdfFontToCss("ABCDEF+MyOfficeFace-Bold")).toContain('"My Office Face"');
    } finally {
      forgetRegisteredUserFont("test-user");
    }
    expect(mapPdfFontToCss("ABCDEF+MyOfficeFace-Bold")).not.toContain('"My Office Face"');
  });

  it("excludes CSV, JSON, and image extensions from font handling", () => {
    for (const ext of [".csv", ".json", ".png", ".jpg"]) {
      expect(FONTLESS_EXTENSIONS.has(ext)).toBe(true);
    }
    expect(FONTLESS_EXTENSIONS.has(".pdf")).toBe(false);
    expect(FONTLESS_EXTENSIONS.has(".docx")).toBe(false);
  });
});

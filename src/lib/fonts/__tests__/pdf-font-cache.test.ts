import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUserFontByName } = vi.hoisted(() => ({
  findUserFontByName: vi.fn(async () => null),
}));

vi.mock("@/lib/fonts/user-fonts", () => ({ findUserFontByName }));

import { createPdfFromText } from "@/lib/document/pages";
import { renderTextPdf } from "@/lib/document/text-to-pdf";

describe("generated text font cache", () => {
  beforeEach(() => {
    findUserFontByName.mockClear();
  });

  it("resolves one face per script instead of one per line", async () => {
    await createPdfFromText(
      ["Hello", "Hello", "日本語です", "日本語です", "سلام عليكم", "سلام عليكم"].join("\n"),
      "Cache"
    );

    expect(findUserFontByName).toHaveBeenCalledTimes(3);
  });

  it("shares the same per-script cache in renderTextPdf", async () => {
    await renderTextPdf(
      ["Hello", "Hello", "日本語です", "日本語です", "سلام عليكم", "سلام عليكم"].join("\n"),
      "Cache"
    );

    expect(findUserFontByName).toHaveBeenCalledTimes(3);
  });
});

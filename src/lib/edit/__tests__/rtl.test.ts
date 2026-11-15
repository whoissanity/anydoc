import { describe, it, expect, vi, afterEach } from "vitest";
import { drawRasterTextBox } from "@/lib/edit/edit-engine";
import { isRtl } from "@/lib/text/bidi";
import type { TextObject } from "@/lib/types";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makeContext() {
  return {
    scale: vi.fn(),
    font: "",
    fillStyle: "",
    textBaseline: "",
    direction: "ltr",
    textAlign: "start",
    fillText: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 8 }),
  };
}

function makeSession(text: string): TextObject {
  return {
    id: "t",
    pageIndex: 0,
    text,
    x: 10,
    y: 10,
    width: 100,
    height: 30,
    fontSize: 12,
    fontFamily: "sans-serif",
    color: "#000000",
    lineHeight: 1.2,
    bold: false,
    underline: false,
    strikethrough: false,
    rotation: 0,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RTL raster text rendering", () => {
  it("detects RTL scripts", () => {
    expect(isRtl("Hello")).toBe(false);
    expect(isRtl("مرحبا")).toBe(true);
    expect(isRtl("שלום")).toBe(true);
  });

  it("sets canvas direction and right alignment for RTL text", async () => {
    const ctx = makeContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () => PNG_1PX,
    };
    // jsdom's `document` is a getter, so replace it through stubGlobal.
    vi.stubGlobal("document", { createElement: () => canvas });

    const page = {
      getSize: () => ({ width: 200, height: 200 }),
      drawImage: vi.fn(),
    };
    const doc = {
      getPage: () => page,
      embedPng: async () => ({ width: 1, height: 1 }),
    };

    const ok = await drawRasterTextBox(
      doc as unknown as Parameters<typeof drawRasterTextBox>[0],
      0,
      makeSession("مرحبا")
    );

    expect(ok).toBe(true);
    expect(ctx.direction).toBe("rtl");
    expect(ctx.textAlign).toBe("right");
    expect(page.drawImage).toHaveBeenCalledOnce();
  });

  it("keeps Latin text LTR and left aligned", async () => {
    const ctx = makeContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () => PNG_1PX,
    };
    vi.stubGlobal("document", { createElement: () => canvas });

    const page = {
      getSize: () => ({ width: 200, height: 200 }),
      drawImage: vi.fn(),
    };
    const doc = {
      getPage: () => page,
      embedPng: async () => ({ width: 1, height: 1 }),
    };

    const ok = await drawRasterTextBox(
      doc as unknown as Parameters<typeof drawRasterTextBox>[0],
      0,
      makeSession("Hello")
    );

    expect(ok).toBe(true);
    expect(ctx.direction).toBe("ltr");
    expect(ctx.textAlign).toBe("left");
  });

  it("draws underline and strikethrough rules for rasterised text", async () => {
    const ctx = makeContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () => PNG_1PX,
    };
    vi.stubGlobal("document", { createElement: () => canvas });

    const page = {
      getSize: () => ({ width: 200, height: 200 }),
      drawImage: vi.fn(),
    };
    const doc = {
      getPage: () => page,
      embedPng: async () => ({ width: 1, height: 1 }),
    };

    await drawRasterTextBox(
      doc as unknown as Parameters<typeof drawRasterTextBox>[0],
      0,
      { ...makeSession("مرحبا"), underline: true, strikethrough: true }
    );

    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    // Both rules are right-anchored inside the padded box (108 − 4 − 40 px wide).
    expect(ctx.moveTo.mock.calls[0][0]).toBeCloseTo(64, 5);
    expect(ctx.moveTo.mock.calls[1][0]).toBeCloseTo(64, 5);
    expect(ctx.moveTo.mock.calls[1][1]).toBeLessThan(ctx.moveTo.mock.calls[0][1]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const recognize = vi.fn();
const terminate = vi.fn();
const createWorker = vi.fn(async () => ({ recognize, terminate }));
const destroy = vi.fn(async () => undefined);
const renderPage = vi.fn(() => ({ promise: Promise.resolve() }));
let pageSize = { width: 612, height: 792 };

vi.mock("tesseract.js", () => ({ createWorker }));
vi.mock("@/lib/document/raster", () => ({
  loadRasterDoc: vi.fn(async () => ({
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: pageSize.width * scale,
        height: pageSize.height * scale,
      }),
      render: renderPage,
    }),
    destroy,
  })),
}));

import { recognizeCanvas, renderPageForOcr } from "@/lib/ocr/service";

const blockResult = {
  data: {
    text: "Hello world",
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  { text: "Hello", confidence: 92, bbox: { x0: 100, y0: 50, x1: 200, y1: 90 } },
                  { text: "world", confidence: 88, bbox: { x0: 220, y0: 50, x1: 340, y1: 90 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

beforeEach(() => {
  recognize.mockReset().mockResolvedValue(blockResult);
  terminate.mockReset().mockResolvedValue(undefined);
  createWorker.mockClear();
  destroy.mockClear();
  renderPage.mockClear();
  pageSize = { width: 612, height: 792 };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillStyle: "#ffffff",
    fillRect: vi.fn(),
  } as never);
});

describe("recognizeCanvas", () => {
  it("asks Tesseract for blocks, since v6 omits them by default", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 200;

    await recognizeCanvas(canvas, 0);

    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(1);
    const [, options, output] = recognize.mock.calls[0];
    expect(options).toEqual({});
    expect(output).toMatchObject({ text: true, blocks: true });
  });

  it("maps word boxes from the blocks hierarchy into 0–1 page coordinates", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 200;

    const page = await recognizeCanvas(canvas, 2);

    expect(page.pageIndex).toBe(2);
    expect(page.text).toBe("Hello world");
    expect(page.words).toHaveLength(2);
    expect(page.words[0]).toMatchObject({
      text: "Hello",
      confidence: 92,
      x: 0.25,
      y: 0.25,
      width: 0.25,
      height: 0.2,
    });
    expect(page.words[1]?.text).toBe("world");
    expect(page.words[1]?.x).toBeCloseTo(0.55, 5);
    expect(page.words[1]?.width).toBeCloseTo(0.3, 5);
  });

  it("always terminates the worker, even when recognition fails", async () => {
    recognize.mockRejectedValueOnce(new Error("worker crashed"));
    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 10;

    await expect(recognizeCanvas(canvas, 0)).rejects.toThrow("worker crashed");
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});

describe("renderPageForOcr", () => {
  it("renders at 2x so glyphs are big enough to recognise", async () => {
    const canvas = await renderPageForOcr(new Uint8Array([1]), 1);

    expect(canvas.width).toBe(1224);
    expect(canvas.height).toBe(1584);
    expect(renderPage).toHaveBeenCalledTimes(1);
  });

  it("never renders below 2x even when asked for less", async () => {
    const canvas = await renderPageForOcr(new Uint8Array([1]), 1, 0.3);

    expect(canvas.width).toBe(1224);
  });

  it("caps the rendered bitmap for an oversized page", async () => {
    pageSize = { width: 10000, height: 10000 };

    const canvas = await renderPageForOcr(new Uint8Array([1]), 1, 2);

    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(4096);
    expect(Math.min(canvas.width, canvas.height)).toBeGreaterThan(0);
  });

  it("releases its private document instance", async () => {
    await renderPageForOcr(new Uint8Array([1]), 1);

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

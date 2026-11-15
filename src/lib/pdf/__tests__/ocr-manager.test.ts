import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OcrWorkerLike } from "@/lib/pdf/ocr-manager";
import { formatOcrProgress, type OcrWorkerRequest, type OcrWorkerResponse } from "@/lib/pdf/ocr-protocol";

const h = vi.hoisted(() => {
  const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  return {
    renderPage,
    cleanup: vi.fn(),
    destroy: vi.fn(async () => undefined),
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 612 * scale,
      height: 792 * scale,
    })),
    getPage: vi.fn(),
    loadRasterDoc: vi.fn(),
    canvasToPngBytes: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
    withRenderLock: vi.fn(async (task: () => Promise<void>) => task()),
    savePdfBytes: vi.fn(async () => new Uint8Array([9])),
    embedAppFont: vi.fn(async () => ({ encodeText: () => new Uint8Array() })),
    drawText: vi.fn(),
    embedPng: vi.fn(async () => ({ width: 1224, height: 1584 })),
    addPage: vi.fn(),
    create: vi.fn(),
  };
});

h.getPage.mockImplementation(async () => ({
  getViewport: h.getViewport,
  render: h.renderPage,
  cleanup: h.cleanup,
}));
h.loadRasterDoc.mockImplementation(async () => ({
  numPages: 2,
  getPage: h.getPage,
  destroy: h.destroy,
}));
h.addPage.mockImplementation(() => ({
  getSize: () => ({ width: 612, height: 792 }),
  drawText: h.drawText,
}));
h.create.mockImplementation(async () => ({ embedPng: h.embedPng, addPage: h.addPage }));

vi.mock("@/lib/document/raster", () => ({
  loadRasterDoc: h.loadRasterDoc,
  canvasToPngBytes: h.canvasToPngBytes,
}));
vi.mock("@/lib/document/render-queue", () => ({ withRenderLock: h.withRenderLock }));
vi.mock("@/lib/document/pages", () => ({ savePdfBytes: h.savePdfBytes }));
vi.mock("@/lib/text/embedded-fonts", () => ({ embedAppFont: h.embedAppFont }));
vi.mock("pdf-lib", () => ({
  PDFDocument: { create: h.create },
  rgb: vi.fn(() => ({})),
}));

import { OCR_DPI, runOcrPipeline } from "@/lib/pdf/ocr-manager";

class FakeWorker implements OcrWorkerLike {
  private listeners = new Set<(event: MessageEvent<OcrWorkerResponse>) => void>();
  constructor(private readonly withProgress = false) {}
  postMessage = vi.fn((message: OcrWorkerRequest) => {
    if (message.type !== "recognize") return;
    const id = message.id;
    queueMicrotask(() => {
      if (this.withProgress) {
        this.emit({
          data: {
            type: "progress",
            pageIndex: message.pageIndex,
            status: "Detecting text with PaddleOCR…",
            engine: "paddle",
          },
        } as MessageEvent<OcrWorkerResponse>);
      }
      this.emit({
        data: {
          type: "result",
          id,
          page: {
            pageIndex: message.pageIndex,
            text: "hello",
            words: [
              { text: "hello", confidence: 90, x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
            ],
            engine: "paddle",
            confidence: 0.9,
          },
        },
      } as MessageEvent<OcrWorkerResponse>);
    });
  });
  terminate = vi.fn();
  addEventListener = vi.fn(
    (type: "message", listener: (event: MessageEvent<OcrWorkerResponse>) => void) => {
      if (type === "message") this.listeners.add(listener);
    }
  );
  removeEventListener = vi.fn(
    (type: "message", listener: (event: MessageEvent<OcrWorkerResponse>) => void) => {
      if (type === "message") this.listeners.delete(listener);
    }
  );
  private emit(event: MessageEvent<OcrWorkerResponse>) {
    for (const listener of this.listeners) listener(event);
  }
}

beforeEach(() => {
  h.renderPage.mockClear();
  h.cleanup.mockClear();
  h.destroy.mockClear();
  h.getViewport.mockClear();
  h.getPage.mockClear();
  h.canvasToPngBytes.mockClear();
  h.withRenderLock.mockClear();
  h.savePdfBytes.mockClear();
  h.embedAppFont.mockClear();
  h.drawText.mockClear();
  h.embedPng.mockClear();
  h.addPage.mockClear();
  h.create.mockClear();
  h.getPage.mockImplementation(async () => ({
    getViewport: h.getViewport,
    render: h.renderPage,
    cleanup: h.cleanup,
  }));
  h.loadRasterDoc.mockImplementation(async () => ({
    numPages: 2,
    getPage: h.getPage,
    destroy: h.destroy,
  }));
  h.addPage.mockImplementation(() => ({
    getSize: () => ({ width: 612, height: 792 }),
    drawText: h.drawText,
  }));
  h.create.mockImplementation(async () => ({ embedPng: h.embedPng, addPage: h.addPage }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillStyle: "#ffffff",
    fillRect: vi.fn(),
  } as never);
});

describe("runOcrPipeline", () => {
  it("renders at 150 DPI, processes pages sequentially, and cleans each canvas", async () => {
    const progress: string[] = [];
    const result = await runOcrPipeline({
      bytes: new Uint8Array([1]),
      createWorker: () => new FakeWorker(),
      onProgress: (update) => progress.push(update.status),
    });

    expect(h.getViewport).toHaveBeenCalledWith({ scale: 150 / 72 });
    expect(h.getViewport).toHaveBeenCalledTimes(2);
    expect(h.renderPage).toHaveBeenCalledTimes(2);
    expect(h.canvasToPngBytes).toHaveBeenCalledTimes(2);
    expect(h.cleanup).toHaveBeenCalledTimes(2);
    expect(h.destroy).toHaveBeenCalledTimes(1);
    expect(result.engines).toEqual(["paddle", "paddle"]);
    expect(result.pages.map((page) => page.pageIndex)).toEqual([0, 1]);
    expect(progress[0]).toContain("Rendering page 1 at 150 DPI");
    expect(progress.some((status) => status === "Finalizing searchable PDF…")).toBe(true);
  });

  it("draws invisible word boxes for each page", async () => {
    await runOcrPipeline({
      bytes: new Uint8Array([1]),
      createWorker: () => new FakeWorker(),
    });

    expect(h.embedPng).toHaveBeenCalledTimes(2);
    expect(h.addPage).toHaveBeenCalledTimes(2);
    expect(h.drawText).toHaveBeenCalled();
    expect(h.drawText.mock.calls[0]?.[1]).toMatchObject({
      opacity: 0.01,
      size: expect.any(Number),
    });
  });

  it("reports live page/total progress in the X/Y format", async () => {
    const updates: Array<{ page: number; total: number; status: string }> = [];
    await runOcrPipeline({
      bytes: new Uint8Array([1]),
      createWorker: () => new FakeWorker(true),
      onProgress: (update) => updates.push(update),
    });

    const recognized = updates.find(
      (update) => update.status === "Detecting text with PaddleOCR…"
    );
    expect(recognized).toEqual({
      page: 1,
      total: 2,
      status: "Detecting text with PaddleOCR…",
      engine: "paddle",
    });
    expect(formatOcrProgress(recognized!)).toBe("1/2: Detecting text with PaddleOCR…");
  });

  it("uses the configured DPI for the render scale", () => {
    expect(OCR_DPI).toBe(150);
  });
});
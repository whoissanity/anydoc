import { beforeEach, describe, expect, it, vi } from "vitest";

const PAGES = 3;

vi.mock("@/lib/document/load", () => ({
  getPdfjs: async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: PAGES,
        getPage: async () => ({
          getViewport: () => ({ width: 10, height: 10 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    }),
  }),
}));

import { renderPagesToBlobs } from "@/lib/document/convert-client";

beforeEach(() => {
  // jsdom has no canvas; the render loop only needs both calls to succeed for progress reporting to run.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
    callback(new Blob(["img"], { type: "image/png" }))
  );
});

describe("renderPagesToBlobs progress", () => {
  it("reports each page and then a finalising step", async () => {
    const seen: Array<{ percent: number; label: string }> = [];

    const blobs = await renderPagesToBlobs(new Uint8Array([1]), "png", 1.5, (progress) =>
      seen.push(progress)
    );

    expect(blobs).toHaveLength(PAGES);
    expect(seen.map((step) => step.label)).toEqual([
      "Rendering page 1 of 3…",
      "Rendering page 2 of 3…",
      "Rendering page 3 of 3…",
      "Finalising images…",
    ]);
    expect(seen.map((step) => step.percent)).toEqual([0, 30, 60, 90]);
  });

  it("never goes backwards and stays below completion", async () => {
    const percents: number[] = [];
    await renderPagesToBlobs(new Uint8Array([1]), "jpeg", 1.5, (progress) =>
      percents.push(progress.percent)
    );

    expect(percents.every((value) => value >= 0 && value <= 90)).toBe(true);
    expect([...percents].sort((a, b) => a - b)).toEqual(percents);
  });

  it("still renders when no progress handler is supplied", async () => {
    await expect(renderPagesToBlobs(new Uint8Array([1]), "png")).resolves.toHaveLength(PAGES);
  });
});

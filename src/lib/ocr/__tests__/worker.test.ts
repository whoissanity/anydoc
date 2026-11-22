import { beforeEach, describe, expect, it, vi } from "vitest";

const createWorker = vi.fn(async (language: string) => ({ language }));
const isPackInstalled = vi.fn<(code: string) => Promise<boolean>>();

vi.mock("tesseract.js", () => ({ createWorker }));
vi.mock("@/lib/ocr/packs", () => ({
  isPackInstalled: (code: string) => isPackInstalled(code),
  getPackMeta: (code: string) => ({ code, label: code.toUpperCase(), bytes: 1, sha256: "x" }),
}));

import { createOcrWorker } from "@/lib/ocr/worker";

beforeEach(() => {
  createWorker.mockClear();
  isPackInstalled.mockReset();
});

describe("createOcrWorker", () => {
  it("uses the requested pack when it is installed", async () => {
    isPackInstalled.mockResolvedValue(true);
    await createOcrWorker("rus");
    expect(createWorker).toHaveBeenCalledWith("rus", 1, expect.anything());
  });

  it("falls back to English and says so when the pack is missing", async () => {
    isPackInstalled.mockImplementation(async (code) => code === "eng");
    const logger = vi.fn();

    await createOcrWorker("rus", logger);

    expect(createWorker).toHaveBeenCalledWith("eng", 1, expect.anything());
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.stringContaining("using English") })
    );
  });

  it("throws an actionable error when English itself is missing", async () => {
    isPackInstalled.mockResolvedValue(false);
    await expect(createOcrWorker("rus")).rejects.toThrow(/OCR Language Packs/);
    expect(createWorker).not.toHaveBeenCalled();
  });
});

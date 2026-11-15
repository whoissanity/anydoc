import { describe, expect, it } from "vitest";
import {
  averageConfidence,
  formatOcrProgress,
  normalizePaddleWords,
  paddleResultNeedsFallback,
} from "@/lib/pdf/ocr-protocol";

describe("OCR protocol", () => {
  it("formats the modal status as X/Y: [Status]", () => {
    expect(
      formatOcrProgress({
        page: 2,
        total: 5,
        status: "Reading text with PaddleOCR",
      })
    ).toBe("2/5: Reading text with PaddleOCR");
  });

  it("falls back when Paddle has zero confidence or no text", () => {
    expect(
      paddleResultNeedsFallback({
        text: "nothing",
        confidence: 0,
        results: [],
      })
    ).toBe(true);
    expect(
      paddleResultNeedsFallback({
        text: "",
        confidence: 0.9,
        results: [],
      })
    ).toBe(true);
    expect(
      paddleResultNeedsFallback({
        text: "hello",
        confidence: 0.9,
        results: [{ text: "hello", confidence: 0.9, box: { x: 0, y: 0, width: 10, height: 10 } }],
      })
    ).toBe(false);
  });

  it("converts Paddle pixel boxes and 0–1 confidence to editor coordinates", () => {
    const words = normalizePaddleWords(
      {
        text: "Hello world",
        confidence: 0.8,
        results: [
          { text: "Hello", confidence: 0.92, box: { x: 100, y: 50, width: 100, height: 40 } },
          { text: "world", confidence: 0.2, box: { x: 220, y: 50, width: 120, height: 40 } },
          { text: "noise", confidence: 0.2, box: { x: 360, y: 50, width: 20, height: 40 } },
        ],
      },
      400,
      200
    );

    expect(words.map((word) => word.text)).toEqual(["Hello"]);
    expect(words[0]).toMatchObject({
      confidence: 92,
      x: 0.25,
      y: 0.25,
      width: 0.25,
      height: 0.2,
    });
  });

  it("averages word confidence", () => {
    expect(
      averageConfidence([
        { text: "a", confidence: 80, x: 0, y: 0, width: 0.1, height: 0.1 },
        { text: "b", confidence: 60, x: 0, y: 0, width: 0.1, height: 0.1 },
      ])
    ).toBe(70);
  });
});
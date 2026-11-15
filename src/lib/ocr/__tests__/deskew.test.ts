import { describe, expect, it } from "vitest";
import { bestSkewAngle, mapWordFromDeskew } from "@/lib/ocr/deskew";
import type { OcrWordBox } from "@/lib/types";

function linePoints(slope: number, count = 400) {
  return Array.from({ length: count }, (_, i) => ({
    x: i * 1.2,
    y: 200 + slope * i * 1.2 + (i % 3), // deterministic jitter, like ink
  }));
}

describe("bestSkewAngle", () => {
  it("leaves a straight page alone", () => {
    expect(bestSkewAngle(linePoints(0))).toBe(0);
  });

  it("detects a small clockwise skew", () => {
    const angle = bestSkewAngle(linePoints(Math.tan((4 * Math.PI) / 180)));
    expect(Math.abs(angle)).toBeGreaterThanOrEqual(3.5);
    expect(Math.abs(angle)).toBeLessThanOrEqual(4.5);
  });

  it("detects a small counter-clockwise skew", () => {
    const angle = bestSkewAngle(linePoints(-Math.tan((3 * Math.PI) / 180)));
    expect(Math.abs(angle)).toBeGreaterThanOrEqual(2.5);
    expect(Math.abs(angle)).toBeLessThanOrEqual(3.5);
  });

  it("ignores pages with too little ink to measure", () => {
    expect(bestSkewAngle(linePoints(0, 3))).toBe(0);
  });
});

describe("mapWordFromDeskew", () => {
  // Centred on the page, so rotation must leave its centre exactly where it was.
  const word: OcrWordBox = { text: "hello", confidence: 90, x: 0.4, y: 0.475, width: 0.2, height: 0.05 };

  it("passes boxes through when the page was not rotated", () => {
    expect(mapWordFromDeskew(word, 0, 1000, 800)).toEqual(word);
  });

  it("keeps the box centre under rotation", () => {
    const mapped = mapWordFromDeskew(word, 5, 1000, 800);
    expect(mapped.x + mapped.width / 2).toBeCloseTo(word.x + word.width / 2, 2);
    expect(mapped.y + mapped.height / 2).toBeCloseTo(word.y + word.height / 2, 2);
  });

  it("keeps boxes inside the page", () => {
    const edge: OcrWordBox = { text: "x", confidence: 90, x: 0.95, y: 0.95, width: 0.05, height: 0.05 };
    const mapped = mapWordFromDeskew(edge, 5, 1000, 800);
    expect(mapped.x).toBeGreaterThanOrEqual(0);
    expect(mapped.y).toBeGreaterThanOrEqual(0);
    expect(mapped.x + mapped.width).toBeLessThanOrEqual(1);
    expect(mapped.y + mapped.height).toBeLessThanOrEqual(1);
  });
});

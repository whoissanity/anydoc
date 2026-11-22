import { describe, expect, it } from "vitest";
import { groupTextBlocks, type PdfTextItemLike } from "@/lib/text/text-blocks";

const PAGE_HEIGHT = 800;

function item(
  str: string,
  x: number,
  baseline: number,
  size = 11,
  fontName = "g_d0_f1",
  width = str.length * size * 0.5
): PdfTextItemLike {
  return { str, transform: [size, 0, 0, size, x, baseline], width, fontName };
}

describe("groupTextBlocks", () => {
  it("merges wrapped lines of one paragraph and keeps the source leading", () => {
    const blocks = groupTextBlocks(
      [
        item("The quick brown fox", 72, 700, 12, "g_d0_f1", 120),
        item("jumps over the", 72, 684, 12, "g_d0_f1", 78),
        item("lazy dog.", 72, 668, 12, "g_d0_f1", 52),
      ],
      { pageHeight: PAGE_HEIGHT }
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("The quick brown fox\njumps over the\nlazy dog.");
    expect(blocks[0].fontSize).toBe(12);
    // 16pt baseline spacing over 12pt type.
    expect(blocks[0].lineHeight).toBeCloseTo(1.333, 2);
    expect(blocks[0].y).toBeCloseTo(PAGE_HEIGHT - 700 - 12, 5);
    expect(blocks[0].height).toBeCloseTo(32 + 12, 5);
    expect(blocks[0].itemIndexes).toEqual([0, 1, 2]);
  });

  it("joins same-line fragments into one line with the missing space", () => {
    const blocks = groupTextBlocks(
      [item("Hello", 72, 700, 10, "g_d0_f1", 26), item("world", 102, 700, 10, "g_d0_f1", 28)],
      { pageHeight: PAGE_HEIGHT }
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("Hello world");
  });

  it("keeps two columns apart", () => {
    const left = [
      item("Left column first", 72, 700, 10, "g_d0_f1", 90),
      item("Left column second", 72, 686, 10, "g_d0_f1", 98),
    ];
    const right = [
      item("Right column first", 330, 700, 10, "g_d0_f1", 96),
      item("Right column second", 330, 686, 10, "g_d0_f1", 104),
    ];

    const blocks = groupTextBlocks([...left, ...right], { pageHeight: PAGE_HEIGHT });

    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe("Left column first\nLeft column second");
    expect(blocks[1].text).toBe("Right column first\nRight column second");
    expect(blocks[0].x).toBe(72);
    expect(blocks[1].x).toBe(330);
  });

  it("does not merge lines in a different face or type size", () => {
    const blocks = groupTextBlocks(
      [
        item("Heading in Times", 72, 700, 18, "g_d0_f2", 140),
        item("Body copy in Helvetica", 72, 676, 10, "g_d0_f1", 110),
      ],
      { pageHeight: PAGE_HEIGHT }
    );

    expect(blocks).toHaveLength(2);
  });

  it("does not merge across a paragraph-scale vertical gap", () => {
    const blocks = groupTextBlocks(
      [item("End of paragraph.", 72, 700, 10, "g_d0_f1", 90), item("New paragraph.", 72, 630, 10, "g_d0_f1", 75)],
      { pageHeight: PAGE_HEIGHT }
    );

    expect(blocks).toHaveLength(2);
  });

  it("carries bold detection from the page font callback", () => {
    const blocks = groupTextBlocks(
      [item("Bold heading", 72, 700, 16, "g_d0_f3", 90)],
      { pageHeight: PAGE_HEIGHT, isBold: (name) => name === "g_d0_f3" }
    );
    expect(blocks[0].bold).toBe(true);
  });

  it("ignores empty and malformed runs without dropping valid text", () => {
    const blocks = groupTextBlocks(
      [
        { str: "   ", transform: [10, 0, 0, 10, 10, 700] },
        { str: "broken", transform: [0, 0, 0, 0, 10, 700] },
        item("Survivor", 72, 700, 10),
      ],
      { pageHeight: PAGE_HEIGHT }
    );
    expect(blocks.map((b) => b.text)).toEqual(["Survivor"]);
  });
});

import { describe, expect, it } from "vitest";
import { reflowText } from "../reflow";

describe("reflowText", () => {
  it("joins positioned runs with spaces", () => {
    expect(reflowText([{ str: "Hello" }, { str: "world" }])).toBe("Hello world");
  });

  it("preserves explicit line breaks and collapses runs", () => {
    const text = reflowText([
      { str: "First", hasEOL: true },
      { str: "Second", hasEOL: true },
      { str: "", hasEOL: true },
      { str: "Third" },
    ]);
    expect(text).toBe("First\nSecond\n\nThird");
  });

  it("does not double-space before a line break", () => {
    expect(reflowText([{ str: "One ", hasEOL: true }, { str: "Two" }])).toBe("One\nTwo");
  });

  it("keeps punctuation attached to the preceding word", () => {
    expect(reflowText([{ str: "Hello" }, { str: "," }, { str: " world" }])).toBe("Hello, world");
  });

  it("returns an empty string for no usable items", () => {
    expect(reflowText([])).toBe("");
    expect(reflowText([{ str: "   " }, { str: "" }])).toBe("");
  });
});
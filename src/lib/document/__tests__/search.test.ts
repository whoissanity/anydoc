import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  findMatches,
  makeMatcher,
  normalizeSearchText,
  type SearchIndex,
} from "@/lib/document/search";

const options = { caseSensitive: false, wholeWord: false, diacritics: true };

describe("document search", () => {
  it("normalizes case and diacritics", () => {
    expect(normalizeSearchText("Café", { ...options, diacritics: false })).toBe("cafe");
    expect(normalizeSearchText("Café", { ...options, caseSensitive: true, diacritics: false })).toBe(
      "Cafe"
    );
  });

  it("builds a page index from the text layer", async () => {
    const doc = {
      numPages: 2,
      getPage: async (pageNumber: number) => ({
        getTextContent: async () => ({
          items: [
            { str: "Quarterly" },
            { str: "report" },
            ...(pageNumber === 2 ? [{ str: "Second page" }] : []),
          ],
        }),
      }),
    };
    const index = await buildSearchIndex(doc);
    expect(index.pages).toEqual(["Quarterly report", "Quarterly report Second page"]);
  });

  it("finds case-insensitive matches with snippets", () => {
    const index: SearchIndex = {
      pages: ["Quarterly report for Q3", "Nothing here"],
    };
    const hits = findMatches(index, "REPORT", options);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      pageIndex: 0,
      match: "report",
      before: "quarterly ",
      after: " for q3",
    });
  });

  it("honours whole-word and diacritics options", () => {
    const index: SearchIndex = { pages: ["Café cafe"] };
    expect(findMatches(index, "cafe", { ...options, diacritics: false })).toHaveLength(2);
    expect(
      findMatches(index, "caf", { ...options, wholeWord: true, diacritics: false })
    ).toHaveLength(0);
  });

  it("escapes regex metacharacters", () => {
    expect(makeMatcher("a+b", options).test("a+b")).toBe(true);
  });
});
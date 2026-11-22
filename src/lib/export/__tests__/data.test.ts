import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/export/writers/data";
import type { DocumentContent, ExportLine } from "@/lib/export/content";

function line(text: string): ExportLine {
  return { text, size: 10, bold: false, italic: false, x: 0, y: 0, level: null };
}

function content(overrides: Partial<DocumentContent> = {}): DocumentContent {
  return {
    title: "Report",
    pages: [{ index: 0, lines: [line("Alpha line")] }],
    tables: [],
    fields: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toCsv", () => {
  it("includes page text when there is no table and no form field", () => {
    const csv = toCsv(content());
    expect(csv).toBe("Page,Text\r\n1,Alpha line\r\n");
  });

  it("includes page text alongside form fields when no table is detected", () => {
    const csv = toCsv(
      content({
        pages: [
          { index: 0, lines: [line("Alpha line")] },
          { index: 1, lines: [line("Beta line")] },
        ],
        fields: [{ name: "Applicant", type: "text", value: "Ada" }],
      })
    );

    const blocks = csv.trimEnd().split("\r\n\r\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("Page,Text");
    expect(blocks[0]).toContain("1,Alpha line");
    expect(blocks[0]).toContain("2,Beta line");
    expect(blocks[1]).toBe("Field,Type,Value\r\nApplicant,text,Ada");
  });

  it("keeps the table matrix instead of page text when a table exists", () => {
    const csv = toCsv(
      content({
        tables: [{ pageIndex: 0, rows: [["Region", "Total"], ["North", "10"]] }],
        fields: [{ name: "Applicant", type: "text", value: "Ada" }],
      })
    );

    expect(csv).toContain("Page,Column 1,Column 2");
    expect(csv).toContain("1,Region,Total");
    expect(csv).not.toContain("Page,Text");
    expect(csv).toContain("Field,Type,Value");
  });

  it("still writes the header for a document with no text at all", () => {
    expect(toCsv(content({ pages: [] }))).toBe("Page,Text\r\n");
  });

  it("quotes cells holding commas, quotes or newlines", () => {
    const csv = toCsv(content({ pages: [{ index: 0, lines: [line('a,b "c')] }] }));
    expect(csv).toContain('1,"a,b ""c"');
  });
});

describe("CSV formula injection", () => {
  const cell = (value: string) => toCsv(content({ pages: [{ index: 0, lines: [line(value)] }] }));

  it("neutralises a formula in PDF body text", () => {
    const csv = cell('=HYPERLINK("http://evil.test","click")');
    // Commas and quotes are RFC-4180 quoted around the apostrophe marker.
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).not.toContain("1,=HYPERLINK");
  });

  it("neutralises the other formula starters", () => {
    expect(cell("+SUM(1,2)")).toContain("'+SUM");
    expect(cell("@SUM(1,2)")).toContain("'@SUM");
    expect(cell("-cmd|' /C calc'!A0")).toContain("'-cmd");
  });

  it("puts the apostrophe directly after the page column", () => {
    for (const value of ["=1+1", "+1", "@A1", "-cmd"]) {
      const row = cell(value).split("\r\n")[1];
      expect(row, value).toMatch(/^1,"?'/);
    }
  });

  it("leaves negative numbers and ordinary prose alone", () => {
    expect(cell("-12.5")).toContain("1,-12.5");
    expect(cell("-3")).toContain("1,-3");
    expect(cell("Total 5")).toContain("1,Total 5");
  });
});

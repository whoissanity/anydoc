import { describe, expect, it } from "vitest";
import { formatMeta } from "@/lib/export/catalog";
import type { DocumentContent, ExportLine } from "@/lib/export/content";
import { buildDocx } from "@/lib/export/writers/docx";
import { buildEpub } from "@/lib/export/writers/epub";
import { buildOdt, buildOds } from "@/lib/export/writers/odf";
import { buildPptx } from "@/lib/export/writers/pptx";
import { buildXlsx } from "@/lib/export/writers/xlsx";

function line(text: string): ExportLine {
  return { text, size: 10, bold: false, italic: false, x: 0, y: 0, level: null };
}

const content: DocumentContent = {
  title: "Report",
  pages: [{ index: 0, lines: [line("Alpha line")] }],
  tables: [{ pageIndex: 0, rows: [["Region", "Total"], ["North", "10"]] }],
  fields: [{ name: "Applicant", type: "text", value: "Ada" }],
  generatedAt: "2026-01-01T00:00:00.000Z",
};

const MIME = (id: "docx" | "xlsx" | "pptx" | "odt" | "ods" | "epub") => formatMeta(id)?.mime;

describe("zip-packaged exports report their own MIME type", () => {
  it.each<[string, () => Promise<Blob>]>([
    ["docx", () => buildDocx(content)],
    ["xlsx", () => buildXlsx(content)],
    ["pptx", () => buildPptx(content)],
    ["odt", () => buildOdt(content)],
    ["ods", () => buildOds(content)],
    ["epub", () => buildEpub(content)],
  ])("%s", async (id, build) => {
    const blob = await build();
    const expected = MIME(id as "docx");
    expect(expected).toBeTruthy();
    expect(blob.type).toBe(expected);
    expect(blob.type).not.toBe("application/zip");
  });
});

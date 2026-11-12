import { PDFDict, PDFHexString, PDFName, PDFNumber } from "pdf-lib";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";

export interface BookmarkEntry {
  title: string;
  pageIndex: number;
}

/** Parses a bulk-edit textarea: one "Title | 12" per line (also comma or tab before the page number). */
export function parseBookmarkLines(input: string, pageCount: number): BookmarkEntry[] {
  const entries: BookmarkEntry[] = [];
  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(.*?)[\s|,\t]+(\d+)$/);
    if (!match) continue;
    const page = Number(match[2]);
    if (!Number.isFinite(page) || page < 1 || page > pageCount) continue;
    entries.push({
      title: (match[1] || `Page ${page}`).trim().slice(0, 200),
      pageIndex: page - 1,
    });
  }
  return entries;
}

export function formatBookmarkLines(
  items: Array<{ title: string; pageIndex: number | null }>
): string {
  return items
    .filter((item) => item.pageIndex != null)
    .map((item) => `${item.title} | ${(item.pageIndex as number) + 1}`)
    .join("\n");
}

/** Replaces the document outline with a flat, ordered list; an empty list removes the outline entirely. */
export async function writeBookmarks(
  bytes: Uint8Array,
  entries: BookmarkEntry[]
): Promise<{ bytes: Uint8Array; count: number }> {
  const doc = await loadPdfLib(bytes);
  const ctx = doc.context;
  const pages = doc.getPages();
  const valid = entries
    .filter((entry) => entry.pageIndex >= 0 && entry.pageIndex < pages.length)
    .slice(0, 400);

  doc.catalog.delete(PDFName.of("Outlines"));
  if (!valid.length) {
    return { bytes: await savePdfBytes(doc), count: 0 };
  }

  const outlinesRef = ctx.nextRef();
  const outlines = ctx.obj({ Type: "Outlines" });

  const refs = valid.map((entry) => {
    const item = ctx.obj({ Title: PDFHexString.fromText(entry.title || `Page ${entry.pageIndex + 1}`) });
    item.set(PDFName.of("Parent"), outlinesRef);
    item.set(PDFName.of("Dest"), ctx.obj([pages[entry.pageIndex].ref, PDFName.of("Fit")]));
    return ctx.register(item);
  });

  refs.forEach((ref, index) => {
    const dict = ctx.lookup(ref) as PDFDict;
    if (index > 0) dict.set(PDFName.of("Prev"), refs[index - 1]);
    if (index < refs.length - 1) dict.set(PDFName.of("Next"), refs[index + 1]);
  });

  outlines.set(PDFName.of("First"), refs[0]);
  outlines.set(PDFName.of("Last"), refs[refs.length - 1]);
  outlines.set(PDFName.of("Count"), PDFNumber.of(refs.length));
  ctx.assign(outlinesRef, outlines);

  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));

  return { bytes: await savePdfBytes(doc), count: refs.length };
}

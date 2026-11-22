import type { OutlineItem } from "@/lib/types";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";

export interface SplitPart {
  name: string;
  bytes: Uint8Array;
}

async function pagesToPart(
  sourceBytes: Uint8Array,
  indices: number[],
  name: string
): Promise<SplitPart> {
  const src = await loadPdfLib(sourceBytes);
  const out = await (await import("pdf-lib")).PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return { name, bytes: await savePdfBytes(out) };
}

/** Splits into chunks of N pages: 5 pages / 2 -> 1-2, 3-4, 5 */
export async function splitEveryN(bytes: Uint8Array, size: number): Promise<SplitPart[]> {
  const src = await loadPdfLib(bytes);
  const count = src.getPageCount();
  const n = Math.max(1, Math.min(size, count));
  const parts: SplitPart[] = [];

  for (let start = 0; start < count; start += n) {
    const indices = Array.from({ length: Math.min(n, count - start) }, (_, i) => start + i);
    const from = indices[0] + 1;
    const to = indices[indices.length - 1] + 1;
    parts.push(
      await pagesToPart(
        bytes,
        indices,
        `part-${parts.length + 1}-pages-${from}${to !== from ? `-${to}` : ""}.pdf`
      )
    );
  }

  return parts;
}

/** Splits by approximate output size, measured page by page. */
export async function splitBySize(
  bytes: Uint8Array,
  targetBytes: number,
  onProgress?: (msg: string) => void
): Promise<SplitPart[]> {
  const src = await loadPdfLib(bytes);
  const count = src.getPageCount();
  const sizes: number[] = [];

  for (let i = 0; i < count; i++) {
    onProgress?.(`Measuring page ${i + 1} of ${count}…`);
    const single = await pagesToPart(bytes, [i], "measure.pdf");
    sizes.push(single.bytes.byteLength);
  }

  const groups: number[][] = [];
  let current: number[] = [];
  let currentSize = 0;
  const limit = Math.max(64 * 1024, targetBytes);

  for (let i = 0; i < count; i++) {
    // Small overhead for the shared xref/table of each output file.
    const estimated = sizes[i] + 800;
    if (current.length && currentSize + estimated > limit) {
      groups.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(i);
    currentSize += estimated;
  }
  if (current.length) groups.push(current);

  return Promise.all(
    groups.map((indices, idx) =>
      pagesToPart(
        bytes,
        indices,
        `part-${idx + 1}-pages-${indices[0] + 1}${
          indices.length > 1 ? `-${indices[indices.length - 1] + 1}` : ""
        }.pdf`
      )
    )
  );
}

/** Splits at top-level bookmark boundaries (chapters / sections). */
export async function splitByBookmarks(
  bytes: Uint8Array,
  outline: OutlineItem[]
): Promise<SplitPart[]> {
  const src = await loadPdfLib(bytes);
  const count = src.getPageCount();
  const anchors = outline
    .filter((item) => item.pageIndex != null)
    .map((item) => ({ title: item.title, page: item.pageIndex as number }))
    .sort((a, b) => a.page - b.page);

  if (!anchors.length) {
    throw new Error("This document has no bookmarks to split on");
  }

  const parts: SplitPart[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const start = Math.max(0, Math.min(anchors[i].page, count - 1));
    const next = i + 1 < anchors.length ? Math.min(anchors[i + 1].page, count) : count;
    const end = Math.max(start + 1, next);
    const indices = Array.from({ length: end - start }, (_, k) => start + k);
    const safe = anchors[i].title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 50) || `chapter-${i + 1}`;
    parts.push(await pagesToPart(bytes, indices, `${String(i + 1).padStart(2, "0")}-${safe}.pdf`));
  }

  return parts;
}

/** Splits odd and even pages into two documents (duplex scanning cleanup). */
export async function splitOddEven(bytes: Uint8Array): Promise<SplitPart[]> {
  const src = await loadPdfLib(bytes);
  const count = src.getPageCount();
  const odd: number[] = [];
  const even: number[] = [];
  for (let i = 0; i < count; i++) (i % 2 === 0 ? odd : even).push(i);

  const parts: SplitPart[] = [];
  if (odd.length) parts.push(await pagesToPart(bytes, odd, "odd-pages.pdf"));
  if (even.length) parts.push(await pagesToPart(bytes, even, "even-pages.pdf"));
  return parts;
}

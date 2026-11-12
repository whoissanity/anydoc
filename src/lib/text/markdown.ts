"use client";

import { loadRasterDoc } from "@/lib/document/raster";

/** PDF -> Markdown with structure detection, rebuilding headings/lists from each run's baseline, size and font. */

interface RawItem {
  x: number;
  y: number;
  text: string;
  height: number;
}

interface Line {
  y: number;
  height: number;
  text: string;
}

function median(values: number[]): number {
  if (!values.length) return 10;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function groupLines(items: RawItem[]): Line[] {
  const clusters: RawItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const current = clusters[clusters.length - 1];
    if (current && Math.abs(current[0].y - item.y) <= Math.max(2, item.height * 0.5)) {
      current.push(item);
    } else {
      clusters.push([item]);
    }
  }

  return clusters
    .map((cluster) => {
      const sorted = [...cluster].sort((a, b) => a.x - b.x);
      let text = "";
      let cursorX = -Infinity;
      for (const item of sorted) {
        if (text && item.x - cursorX > item.height * 1.7) text += "  ";
        else if (text) text += " ";
        text += item.text;
        cursorX = item.x + Math.max(item.text.length * item.height * 0.45, item.height);
      }
      return {
        y: cluster[0].y,
        height: Math.max(...cluster.map((item) => item.height)),
        text: text.replace(/\s+/g, " ").trim(),
      };
    })
    .filter((line) => line.text.length > 0);
}

function escapeMarkdown(text: string): string {
  return text.replace(/^([#>\-+*]|\d+\.)\s/, (match) => `\\${match}`);
}

function linesFromOcr(text: string | undefined): Line[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line, index) => ({ y: -index, height: 10, text: line }));
}

export async function pdfToMarkdown(
  bytes: Uint8Array,
  fallbackTitle = "Document",
  ocrText?: ReadonlyMap<number, string> | null
): Promise<string> {
  const doc = await loadRasterDoc(bytes);
  const metadata = await doc.getMetadata().catch(() => null);
  const info = (metadata?.info ?? {}) as Record<string, unknown>;
  const title = String(info.Title ?? "").trim() || fallbackTitle;

  const pageLines: Array<Line[]> = [];
  const heights: number[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: RawItem[] = [];

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , c, d, e, f] = item.transform as number[];
      const height = Math.hypot(c, d) || item.height || 10;
      items.push({ x: e, y: f, text: item.str, height });
      heights.push(height);
    }

    const lines = groupLines(items);
    // Fall back to stored OCR text for scanned pages the PDF has no text for.
    pageLines.push(lines.length ? lines : linesFromOcr(ocrText?.get(pageNumber - 1)));
  }

  const bodySize = median(heights) || 10;
  const blocks: string[] = [];

  for (let pageIndex = 0; pageIndex < pageLines.length; pageIndex++) {
    const lines = pageLines[pageIndex];
    let paragraph: string[] = [];
    let previousY: number | null = null;

    const flush = () => {
      if (!paragraph.length) return;
      const merged = paragraph.join(" ").replace(/\s+/g, " ").trim();
      if (merged) blocks.push(escapeMarkdown(merged));
      paragraph = [];
    };

    for (const line of lines) {
      // Drop a standalone page number that matches the physical page.
      if (line.text === String(pageIndex + 1)) continue;

      const ratio = line.height / bodySize;
      const headingMatch = /^(\d+(?:\.\d+)*)[.)]?\s+/.test(line.text);

      if (ratio >= 1.45 && line.text.length < 140) {
        flush();
        const level = ratio >= 2.1 ? 1 : ratio >= 1.75 ? 2 : 3;
        blocks.push(`${"#".repeat(level)} ${line.text}`);
        previousY = line.y;
        continue;
      }

      const bulletMatch = line.text.match(/^([•·▪◦‣–—-])\s+(.*)$/);
      const numberedMatch = line.text.match(/^(\d{1,3}[.)])\s+(.*)$/);

      if (bulletMatch) {
        flush();
        blocks.push(`- ${bulletMatch[2]}`);
        previousY = line.y;
        continue;
      }
      if (numberedMatch && headingMatch) {
        flush();
        blocks.push(`${numberedMatch[1]} ${numberedMatch[2]}`);
        previousY = line.y;
        continue;
      }

      // A wide vertical gap starts a new paragraph; ordinary line spacing merges so sentences aren't chopped per line.
      const gap = previousY == null ? 0 : previousY - line.y;
      if (paragraph.length && gap > bodySize * 1.9) {
        flush();
      }
      paragraph.push(line.text);
      previousY = line.y;
    }
    flush();

    if (pageIndex < pageLines.length - 1 && blocks.length) {
      blocks.push("---");
    }
  }

  const body = blocks.filter(Boolean).join("\n\n");
  const heading = `# ${title}`;
  const hasTitleHeading = body.startsWith(heading) || body.startsWith(`# ${title.replace(/\s+/g, " ")}`);
  return `${hasTitleHeading ? "" : `${heading}\n\n`}${body}\n`.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

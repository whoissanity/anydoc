/**
 * Groups PDF.js text items into logical paragraph blocks.
 *
 * PDF.js emits one item per glyph run (and often per style change), so clicking a
 * sentence used to edit only the fragment under the pointer. This module rebuilds
 * lines and paragraphs from geometry: baseline, font size/family, and horizontal
 * position. The result is what the on-canvas text editor opens.
 *
 * All coordinates are PDF user-space points, origin bottom-left, except `y`, which
 * is measured downwards from the page top so it matches the HTML overlay.
 */

export interface PdfTextItemLike {
  str: string;
  /** PDF.js text matrix: [a, b, c, d, e, f]. Font size is hypot(c, d). */
  transform: number[];
  width?: number;
  fontName?: string;
}

export interface TextBlockBox {
  /** Index in the original item array; used to hide every span in the block. */
  itemIndexes: number[];
  text: string;
  /** Left edge in points. */
  x: number;
  /** Top edge in points from the page top. */
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /** Baseline-to-baseline distance divided by font size. */
  lineHeight: number;
  fontName?: string;
  bold: boolean;
  id: number;
}

export interface GroupTextOptions {
  /** Page height in points (unscaled), needed to flip baselines into overlay space. */
  pageHeight: number;
  isBold?: (fontName: string | undefined) => boolean;
}

interface Run {
  index: number;
  text: string;
  left: number;
  right: number;
  baseline: number;
  top: number;
  fontSize: number;
  fontName?: string;
  bold: boolean;
  angle: number;
}

interface Line {
  runs: Run[];
  text: string;
  left: number;
  right: number;
  baseline: number;
  top: number;
  fontSize: number;
  fontName?: string;
  bold: boolean;
  angle: number;
}

interface BlockDraft {
  lines: Line[];
  id: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dominant<T>(values: T[]): T | undefined {
  if (!values.length) return undefined;
  const counts = new Map<T, number>();
  let best = values[0];
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function runText(run: Run, previous: Run | undefined): string {
  if (!previous) return run.text;
  const gap = run.left - previous.right;
  // PDF.js usually gives spaces their own item, but many producers simply advance
  // the text matrix. Re-insert the word break the geometry implies.
  const needsSpace =
    gap > Math.max(0.15 * run.fontSize, 0.5) &&
    !/\s$/.test(previous.text) &&
    !/^\s/.test(run.text);
  return needsSpace ? ` ${run.text}` : run.text;
}

function buildLine(runs: Run[]): Line {
  const ordered = [...runs].sort((a, b) => a.left - b.left);
  const size = median(ordered.map((r) => r.fontSize));
  let text = "";
  ordered.forEach((run, index) => {
    text += runText(run, index ? ordered[index - 1] : undefined);
  });
  return {
    runs: ordered,
    text,
    left: Math.min(...ordered.map((r) => r.left)),
    right: Math.max(...ordered.map((r) => r.right)),
    baseline: median(ordered.map((r) => r.baseline)),
    top: Math.min(...ordered.map((r) => r.top)),
    fontSize: size,
    fontName: dominant(ordered.map((r) => r.fontName)),
    bold: ordered.filter((r) => r.bold).length * 2 > ordered.length,
    angle: ordered[0].angle,
  };
}

/** Within one baseline band, split at large gaps so two columns never join. */
function splitLineSegments(runs: Run[]): Run[][] {
  const ordered = [...runs].sort((a, b) => a.left - b.left);
  const segments: Run[][] = [];
  let current: Run[] = [];
  for (const run of ordered) {
    const previous = current[current.length - 1];
    if (previous) {
      const gap = run.left - previous.right;
      const splitAt = Math.max(0.9 * Math.max(run.fontSize, previous.fontSize), 2);
      if (gap > splitAt) {
        segments.push(current);
        current = [];
      }
    }
    current.push(run);
  }
  if (current.length) segments.push(current);
  return segments;
}

function blockText(lines: Line[]): string {
  return lines
    .map((line) => line.text.replace(/\s+$/, ""))
    .filter((line) => line.length > 0)
    .join("\n");
}

function toBlock(draft: BlockDraft): TextBlockBox {
  const lines = draft.lines;
  const left = Math.min(...lines.map((l) => l.left));
  const right = Math.max(...lines.map((l) => l.right));
  const top = Math.min(...lines.map((l) => l.top));
  const bottom = Math.max(...lines.map((l) => l.top + l.fontSize));
  const fontSize = median(lines.map((l) => l.fontSize));
  const spacing = median(
    lines.slice(1).map((line, index) => Math.abs(line.baseline - lines[index].baseline))
  );
  const lineHeight = spacing > 0 ? Math.min(3, Math.max(1, spacing / fontSize)) : 1.25;
  const fontName = dominant(lines.map((l) => l.fontName));
  return {
    id: draft.id,
    itemIndexes: lines.flatMap((l) => l.runs.map((r) => r.index)),
    text: blockText(lines),
    x: left,
    y: top,
    width: Math.max(right - left, fontSize * 0.8),
    height: Math.max(bottom - top, fontSize),
    fontSize,
    lineHeight: Number(lineHeight.toFixed(3)),
    fontName,
    bold: lines.filter((l) => l.bold).length * 2 > lines.length,
  };
}

/**
 * Public entry point. Returns blocks in reading order (top to bottom, then left).
 * A block contains at least one PDF.js item; a document with unusual transforms
 * simply yields more, smaller blocks rather than dropping text.
 */
export function groupTextBlocks(
  items: PdfTextItemLike[],
  options: GroupTextOptions
): TextBlockBox[] {
  const { pageHeight, isBold } = options;
  const runs: Run[] = [];

  items.forEach((item, index) => {
    const text = item.str ?? "";
    if (!text.trim()) return;
    const tx = item.transform;
    if (!Array.isArray(tx) || tx.length < 6) return;
    const fontSize = Math.hypot(tx[2], tx[3]);
    if (!Number.isFinite(fontSize) || fontSize <= 0 || fontSize > 500) return;
    const left = tx[4];
    const baseline = tx[5];
    if (!Number.isFinite(left) || !Number.isFinite(baseline)) return;
    const width =
      typeof item.width === "number" && Number.isFinite(item.width) && item.width > 0
        ? item.width
        : text.length * fontSize * 0.5;
    runs.push({
      index,
      text,
      left,
      right: left + width,
      baseline,
      top: pageHeight - baseline - fontSize,
      fontSize,
      fontName: item.fontName,
      bold: Boolean(isBold?.(item.fontName)),
      angle: (Math.atan2(tx[1], tx[0]) * 180) / Math.PI,
    });
  });

  if (!runs.length) return [];

  // 1. Baseline bands: runs whose baselines agree within a third of the type size.
  runs.sort((a, b) => b.baseline - a.baseline || a.left - b.left);
  const bands: Run[][] = [];
  for (const run of runs) {
    const band = bands.find((candidate) => {
      const reference = candidate[0];
      const tolerance = Math.max(1.5, 0.32 * Math.max(reference.fontSize, run.fontSize));
      return (
        Math.abs(reference.baseline - run.baseline) <= tolerance &&
        Math.abs(reference.angle - run.angle) <= 1
      );
    });
    if (band) band.push(run);
    else bands.push([run]);
  }

  // 2. Split each band into line segments so columns stay separate.
  const lines = bands.flatMap(splitLineSegments).map(buildLine);
  lines.sort((a, b) => a.top - b.top || a.left - b.left);

  // 3. Merge consecutive lines that share a face and align horizontally.
  const blocks: BlockDraft[] = [];
  for (const line of lines) {
    let target: BlockDraft | null = null;
    let bestScore = -Infinity;

    for (const block of blocks) {
      const last = block.lines[block.lines.length - 1];
      if (last.angle !== line.angle || Math.abs(last.angle - line.angle) > 1) continue;
      if (last.bold !== line.bold || (last.fontName ?? "") !== (line.fontName ?? "")) {
        continue;
      }
      const size = Math.max(last.fontSize, line.fontSize);
      if (Math.abs(last.fontSize - line.fontSize) > Math.max(1.5, size * 0.15)) continue;

      // Distinct line, within a paragraph's lead (never more than ~1.9 lines).
      const delta = line.top - last.top;
      if (delta <= 0.4 * size || delta > 1.9 * size) continue;

      const overlap = Math.min(last.right, line.right) - Math.max(last.left, line.left);
      const minWidth = Math.min(last.right - last.left, line.right - line.left);
      const overlapRatio = minWidth > 0 ? overlap / minWidth : 0;
      const leftAligned = Math.abs(line.left - last.left) <= 1.8 * size;
      const rightAligned = Math.abs(line.right - last.right) <= 1.8 * size;
      if (overlapRatio < 0.2 && !leftAligned && !rightAligned) continue;

      const score = overlapRatio * 2 + (leftAligned ? 1 : 0) - delta / (size * 10);
      if (score > bestScore) {
        bestScore = score;
        target = block;
      }
    }

    if (target) target.lines.push(line);
    else blocks.push({ id: blocks.length, lines: [line] });
  }

  return blocks
    .map(toBlock)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((block, index) => ({ ...block, id: index }));
}

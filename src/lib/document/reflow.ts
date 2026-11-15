/** Text items as exposed by PDF.js `getTextContent()`. */
export interface ReflowTextItem {
  str?: string;
  hasEOL?: boolean;
}

/**
 * Flattens PDF.js text items into a readable paragraph stream.
 * PDF.js gives one item per positioned run, so words are joined with spaces and
 * explicit line breaks are preserved; runs of blank lines collapse to one.
 */
export function reflowText(items: ReflowTextItem[]): string {
  let out = "";

  for (const item of items) {
    const value = item.str ?? "";
    if (!value) {
      if (item.hasEOL) out += "\n";
      continue;
    }

    out += value;
    if (!out.endsWith(" ") && !out.endsWith("\n")) out += " ";
    if (item.hasEOL) out += "\n";
  }

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?%)\]])/g, "$1")
    .replace(/([(\[])[ \t]+/g, "$1")
    .trim();
}
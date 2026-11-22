/**
 * Vendored substitute library + curated commercial-name → substitute map.
 *
 * Proprietary Office/UI faces are never redistributed. Liberation families are
 * metric-compatible stand-ins (OFL 1.1); Noto Sans covers broader Latin/Greek/
 * Cyrillic; script packs under /vendor/fonts/scripts are lazy-loaded on demand.
 */
import type { FontFamilyKind } from "./types";

export interface VendoredFace {
  url: string;
  weight: 400 | 700;
  style: "normal" | "italic";
}

export interface VendoredFamily {
  id: string;
  /** Primary PostScript / CSS family name for @font-face. */
  cssFamily: string;
  kind: FontFamilyKind;
  /** Alias names registered so documents asking for commercial faces hit this file. */
  aliases: string[];
  faces: VendoredFace[];
}

const VENDOR = "/vendor/fonts";

export const VENDORED_FAMILIES: VendoredFamily[] = [
  {
    id: "liberation-sans",
    cssFamily: "Liberation Sans",
    kind: "sans",
    aliases: [
      "Arial",
      "ArialMT",
      "Arial-BoldMT",
      "Helvetica",
      "Helvetica-Bold",
      "Helvetica-Oblique",
      "Helvetica-BoldOblique",
      "Calibri",
      "Candara",
      "Segoe UI",
      "SegoeUI",
      "Verdana",
      "Tahoma",
      "Geneva",
      "MS Sans Serif",
      "sans-serif",
    ],
    faces: [
      { url: `${VENDOR}/LiberationSans-Regular.ttf`, weight: 400, style: "normal" },
      { url: `${VENDOR}/LiberationSans-Bold.ttf`, weight: 700, style: "normal" },
      { url: `${VENDOR}/LiberationSans-Italic.ttf`, weight: 400, style: "italic" },
      { url: `${VENDOR}/LiberationSans-BoldItalic.ttf`, weight: 700, style: "italic" },
    ],
  },
  {
    id: "liberation-serif",
    cssFamily: "Liberation Serif",
    kind: "serif",
    aliases: [
      "Times New Roman",
      "TimesNewRoman",
      "TimesNewRomanPSMT",
      "Times",
      "Times-Roman",
      "Times-Bold",
      "Times-Italic",
      "TimesRoman",
      "Georgia",
      "Palatino",
      "Palatino Linotype",
      "Book Antiqua",
      "Cambria",
      "serif",
    ],
    faces: [
      { url: `${VENDOR}/LiberationSerif-Regular.ttf`, weight: 400, style: "normal" },
      { url: `${VENDOR}/LiberationSerif-Bold.ttf`, weight: 700, style: "normal" },
      { url: `${VENDOR}/LiberationSerif-Italic.ttf`, weight: 400, style: "italic" },
      { url: `${VENDOR}/LiberationSerif-BoldItalic.ttf`, weight: 700, style: "italic" },
    ],
  },
  {
    id: "liberation-mono",
    cssFamily: "Liberation Mono",
    kind: "mono",
    aliases: [
      "Courier New",
      "CourierNew",
      "CourierNewPSMT",
      "Courier",
      "Courier-Bold",
      "Consolas",
      "Lucida Console",
      "Menlo",
      "Monaco",
      "monospace",
    ],
    faces: [
      { url: `${VENDOR}/LiberationMono-Regular.ttf`, weight: 400, style: "normal" },
      { url: `${VENDOR}/LiberationMono-Bold.ttf`, weight: 700, style: "normal" },
      { url: `${VENDOR}/LiberationMono-Italic.ttf`, weight: 400, style: "italic" },
      { url: `${VENDOR}/LiberationMono-BoldItalic.ttf`, weight: 700, style: "italic" },
    ],
  },
  {
    id: "noto-sans",
    cssFamily: "Noto Sans",
    kind: "sans",
    aliases: ["NotoSans"],
    faces: [
      { url: `${VENDOR}/NotoSans-Regular.ttf`, weight: 400, style: "normal" },
      { url: `${VENDOR}/NotoSans-Bold.ttf`, weight: 700, style: "normal" },
    ],
  },
];

/** Default family used when nothing else matches — always available offline. */
export const GENERIC_FALLBACK_ID = "liberation-sans";

/** Honesty copy when the resolver lands on the generic fallback. */
export const GENERIC_FALLBACK_NOTICE =
  "No matching font found, using closest available";

const NAME_TO_FAMILY = new Map<string, VendoredFamily>();

function normalizeFontName(name: string): string {
  return name
    .replace(/^[\w]+[+]/, "")
    .replace(/["']/g, "")
    .replace(/,.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

for (const family of VENDORED_FAMILIES) {
  NAME_TO_FAMILY.set(normalizeFontName(family.cssFamily), family);
  for (const alias of family.aliases) {
    NAME_TO_FAMILY.set(normalizeFontName(alias), family);
  }
}

/** Extra commercial / legacy names that collapse onto a vendored family id. */
const EXTRA_NAME_MAP: Record<string, string> = {
  arialblack: "liberation-sans",
  "arial black": "liberation-sans",
  arialnarrow: "liberation-sans",
  "arial narrow": "liberation-sans",
  helv: "liberation-sans",
  "microsoft sans serif": "liberation-sans",
  "segoe ui symbol": "liberation-sans",
  "century gothic": "liberation-sans",
  franklin: "liberation-sans",
  "franklin gothic": "liberation-sans",
  "bookman old style": "liberation-serif",
  garamond: "liberation-serif",
  "century schoolbook": "liberation-serif",
  "comic sans ms": "liberation-sans",
  "trebuchet ms": "liberation-sans",
  impact: "liberation-sans",
  symbol: "liberation-sans",
  zapfdingbats: "liberation-sans",
  wingdings: "liberation-sans",
};

for (const [name, id] of Object.entries(EXTRA_NAME_MAP)) {
  const family = VENDORED_FAMILIES.find((f) => f.id === id);
  if (family) NAME_TO_FAMILY.set(name, family);
}

export function normalizeRequestedFontName(name: string | null | undefined): string {
  if (!name) return "";
  return normalizeFontName(name);
}

export function lookupNameMappedFamily(
  name: string | null | undefined
): VendoredFamily | undefined {
  const key = normalizeRequestedFontName(name);
  if (!key) return undefined;
  const direct = NAME_TO_FAMILY.get(key);
  if (direct) return direct;

  // Substring match for BaseFont strings like "ABCDEF+Arial-BoldMT".
  for (const [mapped, family] of NAME_TO_FAMILY) {
    if (mapped.length >= 4 && key.includes(mapped)) return family;
  }
  return undefined;
}

export function familyById(id: string): VendoredFamily | undefined {
  return VENDORED_FAMILIES.find((f) => f.id === id);
}

export function familyByKind(kind: FontFamilyKind): VendoredFamily {
  return (
    VENDORED_FAMILIES.find((f) => f.kind === kind && f.id.startsWith("liberation")) ??
    familyById(GENERIC_FALLBACK_ID)!
  );
}

/** Pick the closest face URL for weight/style from a vendored family. */
export function pickFaceUrl(
  family: VendoredFamily,
  bold: boolean,
  italic: boolean
): string {
  const weight = bold ? 700 : 400;
  const style = italic ? "italic" : "normal";
  const exact = family.faces.find((f) => f.weight === weight && f.style === style);
  if (exact) return exact.url;
  const weightMatch = family.faces.find((f) => f.weight === weight);
  if (weightMatch) return weightMatch.url;
  const styleMatch = family.faces.find((f) => f.style === style);
  if (styleMatch) return styleMatch.url;
  return family.faces[0]!.url;
}

/**
 * Script pack families are appended to every stack. They are unregistered until
 * the document's text triggers a lazy load, at which point the browser starts
 * using them for glyphs the Latin face cannot cover.
 */
export const SCRIPT_FALLBACK_FAMILIES = [
  "Noto Sans Arabic",
  "Noto Sans Devanagari",
  "Noto Sans JP",
  "Noto Sans KR",
  "Noto Sans SC",
] as const;

/** CSS stack: substitute, multi-script Latin/Greek/Cyrillic, lazy scripts, generic. */
export function cssStackFor(family: VendoredFamily): string {
  const generic =
    family.kind === "serif" ? "serif" : family.kind === "mono" ? "monospace" : "sans-serif";
  const scripts = SCRIPT_FALLBACK_FAMILIES.map((name) => `"${name}"`).join(", ");
  return `"${family.cssFamily}", "Noto Sans", ${scripts}, ${generic}`;
}

/**
 * Formats that never carry a font concept — confirmed excluded from matching.
 * (CSV / JSON / raster images.)
 */
export const FONTLESS_EXTENSIONS = new Set([
  ".csv",
  ".tsv",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
]);

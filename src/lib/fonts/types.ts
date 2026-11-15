/**
 * Shared types for the offline font-resolution system.
 *
 * Scope note (Part 4): CSV, JSON, and raw images have no font concept and are
 * excluded. Word/PowerPoint/OpenDocument/RTF import currently extracts plain
 * text only (see office-extract.ts) — font matching is intentionally a known
 * non-goal for those imports in this phase (decision a). Live surfaces that do
 * use fonts: PDF render/edit, HTML/EPUB/Markdown CSS preview.
 */

export type FontFamilyKind = "sans" | "serif" | "mono";

/** How the resolver chose a face — used for honesty messaging in the UI. */
export type FontMatchTier =
  | "embedded"
  | "user"
  | "name-map"
  | "descriptor"
  | "generic-fallback";

/** PDF / Office-style font descriptor flags when the name table misses. */
export interface FontDescriptorHints {
  serif?: boolean;
  fixedPitch?: boolean;
  bold?: boolean;
  italic?: boolean;
  /** 100–900 when known; otherwise inferred from `bold`. */
  weight?: number;
}

export interface ResolveFontRequest {
  /** Original name from the document, CSS stack, or editor control. */
  name?: string | null;
  descriptor?: FontDescriptorHints;
  /**
   * Names (or BaseFont strings) already present as embedded font programs in
   * the open document. When the request matches one, no substitution runs.
   */
  embeddedNames?: Iterable<string>;
  bold?: boolean;
  italic?: boolean;
}

export interface ResolvedFont {
  /** Stable id of the chosen face (vendored family id or `user:<id>`). */
  familyId: string;
  /** CSS `font-family` primary name to request on screen. */
  cssFamily: string;
  /** Full CSS fallback stack for live HTML rendering. */
  cssStack: string;
  /** Same-origin URL of the TTF/OTF used for PDF embedding, when vendored. */
  embedUrl: string | null;
  /** In-memory bytes for a user-added font (takes precedence over embedUrl). */
  userBytes?: Uint8Array;
  kind: FontFamilyKind;
  bold: boolean;
  italic: boolean;
  tier: FontMatchTier;
  requestedName: string;
  /** True whenever the chosen face is not the exact requested family. */
  substituted: boolean;
  /**
   * Plain-language notice when the match is a last-resort generic fallback.
   * Callers should surface this rather than silently pretending the substitute
   * is the real requested font.
   */
  notice?: string;
}

export interface UserFontRecord {
  id: string;
  familyName: string;
  fileName: string;
  format: "truetype" | "opentype" | "woff" | "woff2";
  bytes: Uint8Array;
  addedAt: number;
  byteLength: number;
}

export type ScriptPackId = "arabic" | "devanagari" | "cjk-sc" | "cjk-jp" | "cjk-kr";

export interface ScriptPackMeta {
  id: ScriptPackId;
  label: string;
  cssFamily: string;
  file: string;
  url: string;
  bytes: number;
  sha256: string;
}

// Fonts offered while editing text. Each value is a CSS stack whose primary name
// maps through the offline resolver onto a vendored Liberation/Noto substitute
// at bake time (never a PDF base-14 reference).
import { resolveCssFontStack, resolveFontSync } from "@/lib/fonts/resolve";
import { GENERIC_FALLBACK_NOTICE } from "@/lib/fonts/catalog";
import { registeredUserFamily } from "@/lib/fonts/registered-user";

const SANS_STACK = resolveFontSync({ name: "Arial" }).cssStack;
const SERIF_STACK = resolveFontSync({ name: "Times New Roman" }).cssStack;
const MONO_STACK = resolveFontSync({ name: "Courier New" }).cssStack;
const NOTO_STACK = resolveFontSync({ name: "Noto Sans" }).cssStack;

export const TEXT_FONT_CHOICES: Array<{ label: string; value: string }> = [
  { label: "Sans", value: SANS_STACK },
  { label: "Serif", value: SERIF_STACK },
  { label: "Mono", value: MONO_STACK },
  { label: "Noto Sans", value: NOTO_STACK },
];

export const MIN_TEXT_FONT_SIZE = 6;
export const MAX_TEXT_FONT_SIZE = 96;

/**
 * Map a PDF BaseFont / editor font name onto a CSS stack backed by vendored
 * @font-face aliases. Always returns a usable stack — never an empty or broken
 * missing-glyph result.
 */
export function mapPdfFontToCss(pdfFontName: string | undefined | null): string {
  const resolved = resolveFontSync({ name: pdfFontName });
  // A user-added face already registered for screen use wins over the substitute,
  // matching the async resolver that embeds it into PDF output.
  const userFamily = registeredUserFamily(pdfFontName);
  return userFamily
    ? `${JSON.stringify(userFamily)}, ${resolved.cssStack}`
    : resolved.cssStack;
}

/** Resolve with honesty metadata for UI that should disclose substitutions. */
export function resolvePdfFontForDisplay(pdfFontName: string | undefined | null) {
  const resolved = resolveCssFontStack(pdfFontName);
  return {
    cssStack: resolved.cssStack,
    substituted: resolved.substituted,
    tier: resolved.tier,
    notice: resolved.notice ?? (resolved.tier === "generic-fallback" ? GENERIC_FALLBACK_NOTICE : undefined),
  };
}

export function guessFontSizeFromHeight(heightPx: number, scale: number): number {
  return Math.max(6, Math.round((heightPx / scale) * 0.85));
}

export function rgbToCss(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

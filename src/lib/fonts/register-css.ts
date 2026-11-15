/**
 * Register vendored substitutes (and user fonts) as real @font-face rules so
 * HTML / EPUB / Markdown previews and the PDF text layer get a sane match for
 * the commercial names documents commonly ask for — all same-origin, no CDN.
 */
"use client";

import { VENDORED_FAMILIES } from "./catalog";
import { listUserFonts } from "./user-fonts";
import {
  forgetRegisteredUserFont,
  notifyUserFontsChanged,
  rememberRegisteredUserFont,
  resetRegisteredUserFonts,
} from "./registered-user";
import { ensureScriptsForText } from "./scripts";
import type { UserFontRecord } from "./types";

const STYLE_ID = "anydoc-font-substitutes";
const registeredUserIds = new Set<string>();
let coreRegistered = false;

function formatSrc(url: string): string {
  if (url.endsWith(".woff2")) return `url("${url}") format("woff2")`;
  if (url.endsWith(".woff")) return `url("${url}") format("woff")`;
  if (url.endsWith(".otf")) return `url("${url}") format("opentype")`;
  return `url("${url}") format("truetype")`;
}

function faceRule(family: string, url: string, weight: number, style: string): string {
  return `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:swap;src:${formatSrc(url)};}`;
}

/** Inject @font-face rules for every vendored family and its commercial aliases. */
export function registerVendoredFontFaces(): void {
  if (typeof document === "undefined" || coreRegistered) return;

  const chunks: string[] = [];
  for (const family of VENDORED_FAMILIES) {
    const names = [family.cssFamily, ...family.aliases.filter((a) => !/^(sans-serif|serif|monospace)$/i.test(a))];
    for (const name of names) {
      for (const face of family.faces) {
        chunks.push(faceRule(name, face.url, face.weight, face.style));
      }
    }
  }

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = chunks.join("\n");
  coreRegistered = true;
}

function userFormat(format: UserFontRecord["format"]): string {
  if (format === "woff2") return "woff2";
  if (format === "woff") return "woff";
  if (format === "opentype") return "opentype";
  return "truetype";
}

/** Register one user font with the browser FontFace API (idempotent). */
export async function registerUserFontFace(record: UserFontRecord): Promise<void> {
  if (typeof document === "undefined") return;
  if (registeredUserIds.has(record.id)) return;

  const buffer = record.bytes.buffer.slice(
    record.bytes.byteOffset,
    record.bytes.byteOffset + record.bytes.byteLength
  ) as ArrayBuffer;
  const face = new FontFace(record.familyName, buffer, {
    weight: "400 700",
    style: "normal",
    display: "swap",
  });
  // Hint the format for engines that care; FontFace still gets raw bytes.
  void userFormat(record.format);
  await face.load();
  document.fonts.add(face);
  registeredUserIds.add(record.id);
  rememberRegisteredUserFont(record.id, record.familyName);
  notifyUserFontsChanged();
}

export async function registerAllUserFontFaces(): Promise<void> {
  try {
    const fonts = await listUserFonts();
    await Promise.all(fonts.map((f) => registerUserFontFace(f)));
  } catch {
    // Storage unavailable — screen still has vendored substitutes.
  }
}

export function unregisterUserFontFace(id: string): void {
  registeredUserIds.delete(id);
  forgetRegisteredUserFont(id);
  notifyUserFontsChanged();
  // FontFace cannot be removed reliably across browsers; a reload clears it.
}

export function resetFontFaceRegistration(): void {
  coreRegistered = false;
  registeredUserIds.clear();
  resetRegisteredUserFonts();
  if (typeof document !== "undefined") {
    document.getElementById(STYLE_ID)?.remove();
  }
}

/**
 * Boot the screen-side font system: vendored aliases, user fonts, and any
 * script packs required by `sampleText`.
 */
export async function ensureScreenFonts(sampleText = ""): Promise<void> {
  registerVendoredFontFaces();
  await registerAllUserFontFaces();
  if (sampleText) await ensureScriptsForText(sampleText);
}

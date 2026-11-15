/**
 * Detect scripts used in document text and lazy-load matching vendored packs.
 * Packs live under /vendor/fonts/scripts (same-origin); nothing is fetched from
 * a CDN at runtime. Bytes stay in a session cache after the first load.
 */
import manifestData from "../../../public/vendor/fonts/scripts/manifest.json";
import type { ScriptPackId, ScriptPackMeta } from "./types";

interface ScriptManifest {
  version: number;
  packs: Record<string, ScriptPackMeta>;
}

const MANIFEST = manifestData as ScriptManifest;

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const DEVANAGARI = /[\u0900-\u097F\uA8E0-\uA8FF]/;
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const KANA = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/;
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
/** Japanese-only marks/words; kanji alone is otherwise shared with Chinese. */
const JAPANESE_HAN = /[々〆ヶ]|日本語|日本|東京|大阪|株式会社/;

const sessionBytes = new Map<ScriptPackId, Promise<Uint8Array>>();
const registeredFaces = new Set<string>();

export function listScriptPacks(): ScriptPackMeta[] {
  return Object.values(MANIFEST.packs);
}

export function getScriptPack(id: ScriptPackId): ScriptPackMeta | undefined {
  return MANIFEST.packs[id];
}

/** Which script packs the given text actually needs. */
export function detectScripts(text: string): ScriptPackId[] {
  if (!text) return [];
  const found: ScriptPackId[] = [];
  if (ARABIC.test(text) && MANIFEST.packs.arabic) found.push("arabic");
  if (DEVANAGARI.test(text) && MANIFEST.packs.devanagari) found.push("devanagari");

  // One CJK pack is enough: Hangul and kana identify their language, while Han
  // characters are shared. Japanese wins when kana/Japanese markers are present;
  // simplified-only characters choose Simplified Chinese; otherwise default SC.
  if (HANGUL.test(text) && MANIFEST.packs["cjk-kr"]) {
    found.push("cjk-kr");
  } else if (KANA.test(text) || JAPANESE_HAN.test(text)) {
    if (MANIFEST.packs["cjk-jp"]) found.push("cjk-jp");
  } else if (HAN.test(text)) {
    // Ambiguous Han text defaults to Simplified Chinese; both packs cover the
    // shared ideographs, so this only affects regional glyph variants.
    if (MANIFEST.packs["cjk-sc"]) found.push("cjk-sc");
  }
  return found;
}

async function fetchPackBytes(pack: ScriptPackMeta): Promise<Uint8Array> {
  if (typeof fetch !== "function") {
    throw new Error("Script font loading requires fetch");
  }
  const response = await fetch(pack.url);
  if (!response.ok) {
    throw new Error(`Could not load script font ${pack.url} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Load a script pack once per session; returns null when the pack is missing. */
export async function loadScriptPack(id: ScriptPackId): Promise<Uint8Array | null> {
  const pack = MANIFEST.packs[id];
  if (!pack) return null;
  const cached = sessionBytes.get(id);
  if (cached) return cached;
  const pending = fetchPackBytes(pack);
  sessionBytes.set(id, pending);
  try {
    return await pending;
  } catch (error) {
    sessionBytes.delete(id);
    throw error;
  }
}

/** Register a pack as a CSS @font-face (idempotent) and return its CSS family. */
export async function ensureScriptCss(id: ScriptPackId): Promise<string | null> {
  const pack = MANIFEST.packs[id];
  if (!pack) return null;
  if (typeof document === "undefined") return pack.cssFamily;
  if (registeredFaces.has(id)) return pack.cssFamily;

  const face = new FontFace(pack.cssFamily, `url(${pack.url})`, {
    weight: "400",
    style: "normal",
    display: "swap",
  });
  await face.load();
  document.fonts.add(face);
  registeredFaces.add(id);
  return pack.cssFamily;
}

/**
 * Detect scripts in `text`, lazy-load matching packs, register them for screen
 * rendering. Returns CSS family names that should be appended to fallback stacks.
 */
export async function ensureScriptsForText(text: string): Promise<string[]> {
  const ids = detectScripts(text);
  const families: string[] = [];
  for (const id of ids) {
    try {
      const name = await ensureScriptCss(id);
      if (name) families.push(name);
      // Warm the byte cache for later PDF embedding without blocking CSS.
      void loadScriptPack(id);
    } catch {
      // A missing pack must not break rendering — Latin substitutes still apply.
    }
  }
  return families;
}

/** Clear session caches (tests). */
export function resetScriptSessionCache(): void {
  sessionBytes.clear();
  registeredFaces.clear();
}

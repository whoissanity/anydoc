import type { PDFDocument, PDFFont } from "pdf-lib";
import type { Fontkit } from "pdf-lib/cjs/types/fontkit";
import {
  familyByKind,
  pickFaceUrl,
} from "@/lib/fonts/catalog";
import { resolveFont, resolveFontSync } from "@/lib/fonts/resolve";
import { detectScripts, loadScriptPack } from "@/lib/fonts/scripts";
import type { FontDescriptorHints, ResolveFontRequest } from "@/lib/fonts/types";

/**
 * Text written by the app is embedded, never referenced as a PDF base-14 font.
 *
 * Liberation Sans / Serif / Mono are vendored under public/vendor/fonts (SIL OFL
 * 1.1) and served same-origin. Resolution goes through the universal font
 * matcher (name map → descriptor → generic fallback) so editor-written text,
 * stamps, form appearances, and generated pages never leave an unembedded
 * Helvetica/Times/Courier reference.
 *
 * Serif and mono requests now embed the matching Liberation face rather than
 * collapsing everything onto sans.
 */
export type EmbeddedFontFamily = "sans" | "serif" | "mono";

export interface EmbedAppFontOptions {
  family?: EmbeddedFontFamily;
  bold?: boolean;
  italic?: boolean;
  /** Original name from the document or editor control — preferred when set. */
  name?: string | null;
  descriptor?: FontDescriptorHints;
  embeddedNames?: Iterable<string>;
  /** Sample text used to lazy-load script packs (Arabic, CJK, …) when needed. */
  text?: string;
}

const fontBytes = new Map<string, Promise<Uint8Array>>();
const registeredDocs = new WeakSet<PDFDocument>();
const embeddedCache = new WeakMap<PDFDocument, Map<string, Promise<PDFFont>>>();
let fontkitPromise: Promise<Fontkit> | null = null;

async function loadFontkit(): Promise<Fontkit> {
  if (!fontkitPromise) {
    fontkitPromise = import("@pdf-lib/fontkit").then((module) => {
      const candidate =
        (module as { default?: Fontkit }).default ?? (module as unknown as Fontkit);
      if (typeof candidate.create !== "function") {
        throw new Error("fontkit could not be loaded");
      }
      return candidate;
    });
  }
  return fontkitPromise;
}

function loadFontBytes(url: string): Promise<Uint8Array> {
  const cached = fontBytes.get(url);
  if (cached) return cached;

  const pending = (async () => {
    if (typeof fetch !== "function") {
      throw new Error("Font loading requires fetch");
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load vendored font ${url} (${response.status})`);
    }
    return new Uint8Array(await response.arrayBuffer());
  })();

  fontBytes.set(url, pending);
  return pending;
}

async function ensureFontkit(doc: PDFDocument): Promise<void> {
  if (registeredDocs.has(doc)) return;
  const fontkit = await loadFontkit();
  doc.registerFontkit(fontkit);
  registeredDocs.add(doc);
}

function cacheKey(urlOrId: string, bold: boolean, italic: boolean): string {
  return `${urlOrId}|b:${bold ? 1 : 0}|i:${italic ? 1 : 0}`;
}

async function embedBytes(
  doc: PDFDocument,
  bytes: Uint8Array,
  key: string
): Promise<PDFFont> {
  await ensureFontkit(doc);
  let docCache = embeddedCache.get(doc);
  if (!docCache) {
    docCache = new Map();
    embeddedCache.set(doc, docCache);
  }
  const hit = docCache.get(key);
  if (hit) return hit;
  const pending = doc.embedFont(bytes);
  docCache.set(key, pending);
  return pending;
}

/**
 * Embed the resolved substitute (or user font) into `doc`.
 * Prefer passing `name` / `text` so matching and script packs can run.
 */
export async function embedAppFont(
  doc: PDFDocument,
  options: EmbedAppFontOptions = {}
): Promise<PDFFont> {
  const bold = options.bold ?? false;
  const italic = options.italic ?? false;

  const request: ResolveFontRequest = {
    name:
      options.name ??
      (options.family === "serif"
        ? "Times New Roman"
        : options.family === "mono"
          ? "Courier New"
          : "Arial"),
    descriptor: options.descriptor,
    embeddedNames: options.embeddedNames,
    bold,
    italic,
  };

  const resolved = await resolveFont(request);

  // A font the user personally added wins over every vendored substitute, even
  // when the text uses a script a lazy pack also covers.
  if (resolved.userBytes) {
    return embedBytes(
      doc,
      resolved.userBytes,
      cacheKey(resolved.familyId, resolved.bold, resolved.italic)
    );
  }

  // Script packs: when the text needs Arabic/CJK/etc., prefer that face for glyphs
  // the Latin Liberation set cannot cover. The Latin face still embeds as primary
  // when no script pack applies.
  if (options.text) {
    const scripts = detectScripts(options.text);
    if (scripts.length > 0) {
      try {
        const packBytes = await loadScriptPack(scripts[0]!);
        if (packBytes) {
          return embedBytes(doc, packBytes, cacheKey(`script:${scripts[0]}`, false, false));
        }
      } catch {
        // Fall through to the Latin/multi-script substitute.
      }
    }
  }

  const url =
    resolved.embedUrl ??
    pickFaceUrl(familyByKind(options.family ?? "sans"), bold, italic);
  return embedBytes(doc, await loadFontBytes(url), cacheKey(url, bold, italic));
}

/**
 * Cache resolved/embedded faces for generated text. The key is script + style,
 * not line text, so repeated lines reuse one IndexedDB lookup and one PDF font.
 */
export function createAppFontCache(doc: PDFDocument): {
  get(options?: EmbedAppFontOptions): Promise<PDFFont>;
} {
  const cache = new Map<string, Promise<PDFFont>>();
  return {
    get(options = {}) {
      const script = options.text
        ? (detectScripts(options.text)[0] ?? "latin")
        : "latin";
      const key = [
        options.name ?? "",
        options.family ?? "",
        options.bold ? "bold" : "regular",
        options.italic ? "italic" : "upright",
        script,
      ].join("|");

      let pending = cache.get(key);
      if (!pending) {
        pending = embedAppFont(doc, {
          ...options,
          text: script === "latin" ? undefined : options.text,
        });
        cache.set(key, pending);
      }
      return pending;
    },
  };
}

/** Exposed for tests and diagnostics: the bytes that must be embedded. */
export async function appFontBytes(
  bold = false,
  family: EmbeddedFontFamily = "sans"
): Promise<Uint8Array> {
  const resolved = resolveFontSync({
    name: family === "serif" ? "Times" : family === "mono" ? "Courier" : "Arial",
    bold,
  });
  if (!resolved.embedUrl) throw new Error("Expected vendored embed URL");
  return loadFontBytes(resolved.embedUrl);
}

/** Last resolve notice for UI honesty banners (generic-fallback only). */
export { GENERIC_FALLBACK_NOTICE } from "@/lib/fonts/catalog";

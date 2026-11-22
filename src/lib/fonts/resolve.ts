/**
 * Font matching chain (Part 2):
 *  1. Document-embedded face → use as-is
 *  2. Curated commercial-name → vendored substitute map
 *  3. Font-descriptor flags (serif / fixed-pitch / weight / italic)
 *  4. Generic sans substitute + honesty notice
 *
 * User-added fonts are checked between (1) and (2) when `resolveFont` runs
 * asynchronously — a font the user personally added wins over a vendored stand-in.
 */
import {
  cssStackFor,
  familyById,
  familyByKind,
  GENERIC_FALLBACK_ID,
  GENERIC_FALLBACK_NOTICE,
  lookupNameMappedFamily,
  normalizeRequestedFontName,
  pickFaceUrl,
  type VendoredFamily,
} from "./catalog";
import { findUserFontByName } from "./user-fonts";
import type {
  FontDescriptorHints,
  FontFamilyKind,
  FontMatchTier,
  ResolveFontRequest,
  ResolvedFont,
} from "./types";

function stripFamilyNoise(name: string): string {
  return name
    .replace(/[-_,\s]*(bold|italic|oblique|regular|medium|light|black|mt|ps|psmt)$/gi, "")
    .trim();
}

function inferBold(name: string, hints?: FontDescriptorHints, explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (typeof hints?.bold === "boolean") return hints.bold;
  if (typeof hints?.weight === "number") return hints.weight >= 600;
  return /bold|black|heavy/i.test(name);
}

function inferItalic(name: string, hints?: FontDescriptorHints, explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (typeof hints?.italic === "boolean") return hints.italic;
  return /italic|oblique/i.test(name);
}

function kindFromDescriptor(hints?: FontDescriptorHints): FontFamilyKind | null {
  if (!hints) return null;
  if (hints.fixedPitch) return "mono";
  if (hints.serif) return "serif";
  if (hints.serif === false && hints.fixedPitch === false) return "sans";
  return null;
}

function kindFromName(name: string): FontFamilyKind | null {
  const n = name.toLowerCase();
  if (/mono|courier|consolas|menlo|monaco|typewriter/.test(n)) return "mono";
  if (/serif|times|georgia|garamond|palatino|cambria|roman/.test(n)) return "serif";
  if (/sans|arial|helvetica|calibri|verdana|tahoma|segoe|gothic|ui/.test(n)) return "sans";
  return null;
}

function embeddedHit(
  requested: string,
  embeddedNames?: Iterable<string>
): boolean {
  if (!requested || !embeddedNames) return false;
  const needle = normalizeRequestedFontName(requested);
  const bare = stripFamilyNoise(needle);
  for (const raw of embeddedNames) {
    const candidate = normalizeRequestedFontName(raw);
    if (!candidate) continue;
    if (candidate === needle) return true;
    if (stripFamilyNoise(candidate) === bare) return true;
    if (candidate.includes(bare) || bare.includes(stripFamilyNoise(candidate))) return true;
  }
  return false;
}

function fromVendored(
  family: VendoredFamily,
  requestedName: string,
  bold: boolean,
  italic: boolean,
  tier: FontMatchTier,
  substituted: boolean,
  notice?: string
): ResolvedFont {
  return {
    familyId: family.id,
    cssFamily: family.cssFamily,
    cssStack: cssStackFor(family),
    embedUrl: pickFaceUrl(family, bold, italic),
    kind: family.kind,
    bold,
    italic,
    tier,
    requestedName,
    substituted,
    notice,
  };
}

function resolveWithoutUser(request: ResolveFontRequest): ResolvedFont {
  const requestedName = (request.name ?? "").trim();
  const bold = inferBold(requestedName, request.descriptor, request.bold);
  const italic = inferItalic(requestedName, request.descriptor, request.italic);

  // 1. Already embedded in the document.
  if (embeddedHit(requestedName, request.embeddedNames)) {
    const mapped = lookupNameMappedFamily(requestedName);
    const family = mapped ?? familyById(GENERIC_FALLBACK_ID)!;
    return {
      ...fromVendored(family, requestedName, bold, italic, "embedded", false),
      // Screen fallback still needs a local face if the text layer paints in HTML;
      // PDF.js canvas path uses the real embedded program directly.
      notice: undefined,
    };
  }

  // 2. Curated name map.
  const named = lookupNameMappedFamily(requestedName);
  if (named) {
    const exact =
      normalizeRequestedFontName(requestedName) ===
        normalizeRequestedFontName(named.cssFamily) ||
      named.aliases.some(
        (a) => normalizeRequestedFontName(a) === normalizeRequestedFontName(requestedName)
      );
    return fromVendored(named, requestedName, bold, italic, "name-map", !exact);
  }

  // 3. Descriptor / name-shape classification.
  const kind =
    kindFromDescriptor(request.descriptor) ?? kindFromName(requestedName) ?? null;
  if (kind) {
    return fromVendored(
      familyByKind(kind),
      requestedName,
      bold,
      italic,
      "descriptor",
      true
    );
  }

  // 4. Generic sans — rare, and labeled honestly.
  return fromVendored(
    familyById(GENERIC_FALLBACK_ID)!,
    requestedName,
    bold,
    italic,
    "generic-fallback",
    true,
    GENERIC_FALLBACK_NOTICE
  );
}

/** Synchronous resolve (vendored substitutes only — no user-font lookup). */
export function resolveFontSync(request: ResolveFontRequest = {}): ResolvedFont {
  return resolveWithoutUser(request);
}

/**
 * Full resolve including user-added fonts. Prefer this for editor/PDF write paths
 * so a font the user added is embedded in output, not only shown on screen.
 */
export async function resolveFont(request: ResolveFontRequest = {}): Promise<ResolvedFont> {
  const requestedName = (request.name ?? "").trim();
  const bold = inferBold(requestedName, request.descriptor, request.bold);
  const italic = inferItalic(requestedName, request.descriptor, request.italic);

  if (embeddedHit(requestedName, request.embeddedNames)) {
    return resolveWithoutUser(request);
  }

  if (requestedName) {
    try {
      const user = await findUserFontByName(stripFamilyNoise(requestedName) || requestedName);
      if (user) {
        return {
          familyId: `user:${user.id}`,
          cssFamily: user.familyName,
          cssStack: `"${user.familyName}", sans-serif`,
          embedUrl: null,
          userBytes: user.bytes,
          kind: "sans",
          bold,
          italic,
          tier: "user",
          requestedName,
          substituted: false,
        };
      }
    } catch {
      // IndexedDB unavailable — continue with vendored substitutes.
    }
  }

  return resolveWithoutUser(request);
}

/** Map a CSS font-family list (possibly multi-value) through the resolver. */
export function resolveCssFontStack(
  cssFontFamily: string | null | undefined,
  descriptor?: FontDescriptorHints
): ResolvedFont {
  if (!cssFontFamily) return resolveFontSync({ descriptor });
  const first = cssFontFamily.split(",")[0]?.trim() ?? "";
  return resolveFontSync({ name: first.replace(/^["']|["']$/g, ""), descriptor });
}

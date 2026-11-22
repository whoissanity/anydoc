/**
 * In-memory index of user fonts whose @font-face is currently registered.
 *
 * IndexedDB lookups are async, but the text layer needs a synchronous CSS stack.
 * This registry lets an exact user font win on screen once FontBoot (or the
 * settings panel) has registered it, without reading storage during render.
 */
const familyById = new Map<string, string>();

/** Fired after a font is registered/removed so open pages rebuild their CSS stacks. */
export const USER_FONTS_CHANGED_EVENT = "anydoc:user-fonts-changed";

export function notifyUserFontsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(USER_FONTS_CHANGED_EVENT));
  }
}

function normalize(name: string): string {
  return name
    .replace(/^[\w]+[+]/, "")
    .replace(/["']/g, "")
    .replace(/,.*$/, "")
    .replace(/[-_,\s]*(bold|italic|oblique|regular|medium|light|black)$/i, "")
    // Font family tokens often drop spaces (MyOfficeFace vs My Office Face).
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function rememberRegisteredUserFont(id: string, familyName: string): void {
  familyById.set(id, familyName);
}

export function forgetRegisteredUserFont(id: string): void {
  familyById.delete(id);
}

/** Family name for a requested document face, when the user added a match. */
export function registeredUserFamily(name: string | null | undefined): string | null {
  const key = normalize(name ?? "");
  if (!key) return null;
  for (const family of familyById.values()) {
    const candidate = normalize(family);
    if (candidate && (candidate === key || key.includes(candidate))) return family;
  }
  return null;
}

/** Test hook: clear the in-memory registry. */
export function resetRegisteredUserFonts(): void {
  familyById.clear();
}

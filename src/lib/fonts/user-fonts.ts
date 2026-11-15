/**
 * User-added local fonts — separate IndexedDB namespace from the document draft.
 *
 * Font files are not document content (AGENTS.md draft rule). They stay on this
 * device, are never transmitted, and the person who adds one is responsible for
 * having the rights to use it. Supported inputs: .ttf / .otf / .woff / .woff2,
 * read entirely client-side.
 */
"use client";

import type { UserFontRecord } from "./types";

const DB_NAME = "anydoc-user-fonts";
const DB_VERSION = 1;
const STORE = "fonts";
const MAX_FONT_BYTES = 8 * 1024 * 1024;
const MAX_FONTS = 40;

const MAGIC = {
  ttf: [0x00, 0x01, 0x00, 0x00],
  otf: [0x4f, 0x54, 0x54, 0x4f], // OTTO
  ttc: [0x74, 0x74, 0x63, 0x66], // ttcf — rejected (collections)
  woff: [0x77, 0x4f, 0x46, 0x46], // wOFF
  woff2: [0x77, 0x4f, 0x46, 0x32], // wOF2
} as const;

export type UserFontError =
  | "unsupported-type"
  | "too-large"
  | "empty"
  | "quota"
  | "limit"
  | "unavailable";

export class UserFontStoreError extends Error {
  readonly code: UserFontError;
  constructor(code: UserFontError, message: string) {
    super(message);
    this.name = "UserFontStoreError";
    this.code = code;
  }
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

function detectFormat(
  bytes: Uint8Array,
  fileName: string
): UserFontRecord["format"] | null {
  if (hasPrefix(bytes, MAGIC.ttc)) return null;
  if (hasPrefix(bytes, MAGIC.woff2)) return "woff2";
  if (hasPrefix(bytes, MAGIC.woff)) return "woff";
  if (hasPrefix(bytes, MAGIC.otf)) return "opentype";
  if (hasPrefix(bytes, MAGIC.ttf)) return "truetype";
  // TrueType sometimes starts with a different scaler type; fall back to extension.
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ext === ".ttf") return "truetype";
  if (ext === ".otf") return "opentype";
  if (ext === ".woff") return "woff";
  if (ext === ".woff2") return "woff2";
  return null;
}

function familyFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+(Regular|Bold|Italic|BoldItalic|Medium|Light|Black)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim() || "User Font";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new UserFontStoreError("unavailable", "IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new UserFontStoreError("unavailable", req.error?.message || "IndexedDB open failed"));
  });
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function toRecord(raw: UserFontRecord): UserFontRecord {
  const bytes =
    raw.bytes instanceof Uint8Array
      ? raw.bytes
      : new Uint8Array(raw.bytes as unknown as ArrayBuffer);
  return { ...raw, bytes, byteLength: bytes.byteLength };
}

export async function listUserFonts(): Promise<UserFontRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const rows = await idbReq(tx.objectStore(STORE).getAll());
    return (rows as UserFontRecord[]).map(toRecord).sort((a, b) => a.addedAt - b.addedAt);
  } finally {
    db.close();
  }
}

export async function getUserFont(id: string): Promise<UserFontRecord | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await idbReq(tx.objectStore(STORE).get(id));
    return row ? toRecord(row as UserFontRecord) : null;
  } finally {
    db.close();
  }
}

/** Find a user font whose family name matches (case-insensitive). */
export async function findUserFontByName(name: string): Promise<UserFontRecord | null> {
  const needle = name.replace(/["']/g, "").trim().toLowerCase();
  if (!needle) return null;
  const all = await listUserFonts();
  return (
    all.find((f) => f.familyName.toLowerCase() === needle) ??
    all.find((f) => needle.includes(f.familyName.toLowerCase())) ??
    null
  );
}

export async function addUserFont(file: File): Promise<UserFontRecord> {
  if (!file || file.size === 0) {
    throw new UserFontStoreError("empty", "The font file is empty");
  }
  if (file.size > MAX_FONT_BYTES) {
    throw new UserFontStoreError(
      "too-large",
      `Font files must be smaller than ${MAX_FONT_BYTES / (1024 * 1024)} MB`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormat(bytes, file.name);
  if (!format) {
    throw new UserFontStoreError(
      "unsupported-type",
      "Only .ttf, .otf, .woff, and .woff2 font files are accepted"
    );
  }

  const existing = await listUserFonts();
  if (existing.length >= MAX_FONTS) {
    throw new UserFontStoreError("limit", `At most ${MAX_FONTS} user fonts can be stored`);
  }

  const record: UserFontRecord = {
    id: `user-${crypto.randomUUID()}`,
    familyName: familyFromFileName(file.name),
    fileName: file.name,
    format,
    bytes,
    addedAt: Date.now(),
    byteLength: bytes.byteLength,
  };

  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbReq(tx.objectStore(STORE).put(record));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/quota/i.test(message)) {
      throw new UserFontStoreError("quota", "Browser storage quota exceeded");
    }
    throw error;
  } finally {
    db.close();
  }

  return record;
}

export async function removeUserFont(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbReq(tx.objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

export async function clearUserFonts(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbReq(tx.objectStore(STORE).clear());
  } finally {
    db.close();
  }
}

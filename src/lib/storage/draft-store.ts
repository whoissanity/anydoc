"use client";

/**
 * Local-first crash recovery for the editor.
 *
 * Drafts live in this browser's IndexedDB and are never sent anywhere: there is no
 * fetch, no beacon, and no server route in this module. Two records are stored:
 *
 *  - `snapshot/current` — the one draft for the document currently open. It covers
 *    the store slices that are not yet baked into `pdfBytes` (annotations, sticky
 *    notes, form fields, OCR results, placed images, placed text, redactions), so a
 *    crash cannot silently drop edits made since the last structural change.
 *  - `prefs/*` — autosave on/off, the first-run notice, and the optional draft
 *    encryption salt. A preference is not document content, and it is what lets
 *    the user turn the feature off.
 *
 * `pdfDocProxy` is a live pdf.js object and is never serialized. Recovery reloads the
 * document through the normal `openPdfBytes` path and then rehydrates the arrays.
 *
 * Privacy posture: by default the snapshot is plaintext in IndexedDB and the UI says
 * so. The user can opt into a passphrase (PBKDF2-SHA-256 -> AES-GCM-256) that is
 * derived in this tab and cached only in memory; the passphrase is never stored and
 * there is no key escrow. A locked draft exposes only its file name and timestamp.
 */

import { useEditorStore } from "@/store/editor-store";
import type {
  AnnotationItem,
  FormFieldDraft,
  ImageObject,
  OcrPage,
  RedactBox,
  StickyNoteItem,
  TextObject,
} from "@/lib/types";
import type { CommentThread } from "@/lib/security/pdf-security";
import { revokeAllTrackedObjectUrls } from "@/lib/storage/object-urls";

export interface DraftSnapshot {
  fileName: string;
  pdfBytes: Uint8Array;
  savedAt: number;
  annotations: AnnotationItem[];
  stickyNotes: StickyNoteItem[];
  formFields: FormFieldDraft[];
  ocrPages: OcrPage[];
  images: ImageObject[];
  redactions: RedactBox[];
  comments: CommentThread[];
  /** Placed text boxes are unsaved edit state too; without them a crash drops added text. */
  textObjects: TextObject[];
  dirty: boolean;
}

/** A draft older than this is treated as gone and deleted, never offered for restore. */
export const DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const AUTOSAVE_DEBOUNCE_MS = 4_000;
export const AUTOSAVE_CEILING_MS = 30_000;

/**
 * Per-document draft cap. A PDF may be up to 100 MB to open, but a crash-recovery
 * copy that large would blow the browser quota and make autosave fail silently, so
 * autosave refuses it up front and the UI says why.
 */
export const DRAFT_MAX_BYTES = 20 * 1024 * 1024;

/** PBKDF2 work factor. OWASP guidance for PBKDF2-SHA256 is 600k; 310k is the local-JS compromise. */
export const DRAFT_KDF_ITERATIONS = 310_000;
export const DRAFT_MIN_PASSPHRASE = 8;

const DB_NAME = "anydoc-local-draft";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshot";
const PREFS_STORE = "prefs";
const DRAFT_KEY = "current";
const AUTOSAVE_PREF = "autosaveEnabled";
const NOTICE_PREF = "autosaveNoticeShown";
const ENCRYPTION_PREF = "draftEncryption";

export type DraftSaveFailureReason =
  | "unavailable"
  | "too-large"
  | "quota"
  | "locked"
  | "error";

export interface DraftSaveResult {
  ok: boolean;
  reason?: DraftSaveFailureReason;
  /** Plaintext snapshot size in bytes, including the serialized edit arrays. */
  size: number;
}

export interface LockedDraftMeta {
  fileName: string;
  savedAt: number;
  size: number;
}

export type DraftRecord =
  | { kind: "plain"; snapshot: DraftSnapshot }
  | { kind: "locked"; meta: LockedDraftMeta };

export type DraftEncryptionSetupResult = {
  ok: boolean;
  reason?:
    | "weak"
    | "already-enabled"
    | "unsupported"
    | "too-large"
    | "quota"
    | "bad-passphrase"
    | "error";
};

export type DraftUnlockResult =
  | { ok: true; snapshot: DraftSnapshot | null }
  | { ok: false; reason: "no-encryption" | "bad-passphrase" | "unsupported" | "corrupt" };

interface EncryptedPayload {
  v: 1;
  salt: string;
  iv: string;
  iterations: number;
  cipher: string;
}

type PlainRecord = DraftSnapshot;
type EncryptedRecord = {
  savedAt: number;
  fileName: string;
  size: number;
  encrypted: EncryptedPayload;
};
type StoredRecord = PlainRecord | EncryptedRecord;

interface EncryptionSalt {
  salt: string;
  iterations: number;
}

export function isDraftStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** WebCrypto subtle is only exposed in secure contexts (HTTPS or localhost). */
export function isDraftEncryptionSupported(): boolean {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isDraftStorageAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE);
      if (!db.objectStoreNames.contains(PREFS_STORE)) db.createObjectStore(PREFS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open local draft storage"));
    request.onblocked = () =>
      reject(new Error("Local draft storage is blocked by another tab"));
  });
  dbPromise = opening;
  // Allow a later attempt (e.g. after the user leaves private browsing).
  opening.catch(() => {
    dbPromise = null;
  });
  return opening;
}

function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = run(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("Local draft storage request failed"));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Local draft storage transaction aborted"));
      })
  );
}

function isQuotaError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.code === 22;
  }
  return false;
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array();
}

type SnapshotState = {
  fileName: string | null;
  pdfBytes: Uint8Array | null;
  /** Decrypted PDFs must not be written to a plaintext local draft. */
  pdfDecrypted?: boolean;
  dirty: boolean;
  annotations: AnnotationItem[];
  stickyNotes: StickyNoteItem[];
  formFields: FormFieldDraft[];
  ocrPages: OcrPage[];
  images: ImageObject[];
  redactions: RedactBox[];
  comments: CommentThread[];
  textObjects: TextObject[];
};

/** Builds the serializable half of the editor state, excluding the live pdf.js proxy. */
export function snapshotFromState(
  state: SnapshotState,
  savedAt: number = Date.now()
): DraftSnapshot | null {
  if (!state.pdfBytes || state.pdfBytes.byteLength === 0) return null;
  if (state.pdfDecrypted) return null;
  return {
    fileName: state.fileName ?? "Untitled.pdf",
    pdfBytes: state.pdfBytes.slice(),
    savedAt,
    annotations: state.annotations,
    stickyNotes: state.stickyNotes,
    formFields: state.formFields,
    ocrPages: state.ocrPages,
    images: state.images,
    redactions: state.redactions,
    comments: state.comments,
    textObjects: state.textObjects,
    dirty: state.dirty,
  };
}

/**
 * Cheap pre-flight size estimate. The byte array dominates; JSON size is counted for
 * the edit slices because embedded image data URLs can be several megabytes.
 */
export function estimateDraftBytes(snapshot: DraftSnapshot): number {
  let extra = 0;
  const slices = [
    snapshot.annotations,
    snapshot.stickyNotes,
    snapshot.formFields,
    snapshot.ocrPages,
    snapshot.images,
    snapshot.redactions,
    snapshot.comments,
    snapshot.textObjects,
  ];
  for (const slice of slices) {
    try {
      extra += JSON.stringify(slice).length * 2;
    } catch {
      // A non-serializable slice is itself a save failure; the byte array still counts.
    }
  }
  return snapshot.pdfBytes.byteLength + extra + 1024;
}

function normalizeRecord(raw: PlainRecord): DraftSnapshot {
  return {
    ...raw,
    pdfBytes: toBytes(raw.pdfBytes),
    annotations: raw.annotations ?? [],
    stickyNotes: raw.stickyNotes ?? [],
    formFields: raw.formFields ?? [],
    ocrPages: raw.ocrPages ?? [],
    images: raw.images ?? [],
    redactions: raw.redactions ?? [],
    comments: raw.comments ?? [],
    textObjects: raw.textObjects ?? [],
    dirty: raw.dirty ?? true,
  };
}

function isEncryptedRecord(raw: StoredRecord): raw is EncryptedRecord {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "encrypted" in raw &&
    typeof (raw as EncryptedRecord).encrypted === "object"
  );
}

/* ------------------------------------------------------------------ *
 * Base64 / WebCrypto helpers
 * ------------------------------------------------------------------ */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSubtle(): SubtleCrypto {
  if (!isDraftEncryptionSupported()) {
    throw new Error("WebCrypto is unavailable in this context");
  }
  return globalThis.crypto.subtle;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptSnapshot(
  snapshot: DraftSnapshot,
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number
): Promise<EncryptedPayload> {
  const subtle = getSubtle();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const serialized = JSON.stringify({
    ...snapshot,
    pdfBytes: bytesToBase64(snapshot.pdfBytes),
  });
  const cipher = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(serialized)
  );
  return {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    iterations,
    cipher: bytesToBase64(new Uint8Array(cipher)),
  };
}

async function decryptSnapshot(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<DraftSnapshot> {
  const subtle = getSubtle();
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.cipher)
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as Omit<DraftSnapshot, "pdfBytes"> & {
    pdfBytes: string;
  };
  return {
    ...parsed,
    pdfBytes: base64ToBytes(parsed.pdfBytes),
    annotations: parsed.annotations ?? [],
    stickyNotes: parsed.stickyNotes ?? [],
    formFields: parsed.formFields ?? [],
    ocrPages: parsed.ocrPages ?? [],
    images: parsed.images ?? [],
    redactions: parsed.redactions ?? [],
    comments: parsed.comments ?? [],
    textObjects: parsed.textObjects ?? [],
  };
}

/* ------------------------------------------------------------------ *
 * Encryption state (memory only; the passphrase is never stored)
 * ------------------------------------------------------------------ */

let cachedKey: CryptoKey | null = null;
let cachedSalt: Uint8Array<ArrayBuffer> | null = null;
let cachedIterations = DRAFT_KDF_ITERATIONS;

/** Fired after a successful unlock so a paused autosave loop can resume from any control. */
const DRAFT_UNLOCKED_EVENT = "anydoc:draft-unlocked";

export function lockDraft(): void {
  cachedKey = null;
  cachedSalt = null;
}

function announceUnlocked(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DRAFT_UNLOCKED_EVENT));
}

export function isDraftUnlocked(): boolean {
  return cachedKey !== null;
}

async function getEncryptionSalt(): Promise<EncryptionSalt | null> {
  if (!isDraftStorageAvailable()) return null;
  const value = await runRequest<EncryptionSalt | undefined>(
    PREFS_STORE,
    "readonly",
    (store) => store.get(ENCRYPTION_PREF)
  );
  if (!value || typeof value.salt !== "string") return null;
  return {
    salt: value.salt,
    iterations:
      typeof value.iterations === "number" && value.iterations > 0
        ? value.iterations
        : DRAFT_KDF_ITERATIONS,
  };
}

export async function isDraftEncryptionEnabled(): Promise<boolean> {
  try {
    return (await getEncryptionSalt()) !== null;
  } catch {
    // Fail safe: if the preference cannot be read, never assume plaintext and write one.
    return true;
  }
}

async function setEncryptionSalt(value: EncryptionSalt | null): Promise<boolean> {
  if (!isDraftStorageAvailable()) return false;
  try {
    if (value === null) {
      await runRequest(PREFS_STORE, "readwrite", (store) => store.delete(ENCRYPTION_PREF));
    } else {
      await runRequest(PREFS_STORE, "readwrite", (store) => store.put(value, ENCRYPTION_PREF));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns on passphrase encryption. Any existing plaintext draft is re-saved as
 * ciphertext in the same transaction flow; if that fails, the setting is rolled
 * back so the UI never reports "encrypted" while plaintext remains on disk.
 */
export async function enableDraftEncryption(
  passphrase: string
): Promise<DraftEncryptionSetupResult> {
  if (!isDraftEncryptionSupported()) return { ok: false, reason: "unsupported" };
  if (passphrase.length < DRAFT_MIN_PASSPHRASE) return { ok: false, reason: "weak" };
  if (await isDraftEncryptionEnabled()) return { ok: false, reason: "already-enabled" };

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iterations = DRAFT_KDF_ITERATIONS;
  const key = await deriveKey(passphrase, salt, iterations);
  cachedKey = key;
  cachedSalt = salt;
  cachedIterations = iterations;
  if (!(await setEncryptionSalt({ salt: bytesToBase64(salt), iterations }))) {
    // Without a persisted salt the next save could not encrypt; never claim it did.
    lockDraft();
    return { ok: false, reason: "error" };
  }

  const raw = await readRawRecord();
  if (raw && !isEncryptedRecord(raw)) {
    const result = await saveDraft(normalizeRecord(raw));
    if (!result.ok) {
      // Roll back: no half-enabled state where plaintext is presented as encrypted.
      await setEncryptionSalt(null);
      lockDraft();
      return { ok: false, reason: result.reason === "quota" ? "quota" : "too-large" };
    }
  }
  return { ok: true };
}

/**
 * Turns encryption off. If a ciphertext record exists, it is decrypted with the
 * supplied passphrase (or the already-unlocked key) and rewritten as plaintext so
 * the draft survives the change.
 */
export async function disableDraftEncryption(passphrase: string): Promise<DraftEncryptionSetupResult> {
  if (!(await isDraftEncryptionEnabled())) {
    lockDraft();
    return { ok: true };
  }
  const raw = await readRawRecord();
  const encrypted = raw && isEncryptedRecord(raw) ? raw : null;

  if (!cachedKey) {
    if (!encrypted) {
      await setEncryptionSalt(null);
      lockDraft();
      return { ok: true };
    }
    const salt = base64ToBytes(encrypted.encrypted.salt);
    cachedKey = await deriveKey(passphrase, salt, encrypted.encrypted.iterations);
    cachedSalt = salt;
    cachedIterations = encrypted.encrypted.iterations;
  }

  if (encrypted) {
    try {
      const snapshot = await decryptSnapshot(encrypted.encrypted, cachedKey);
      await putPlainRecord(snapshot);
    } catch {
      return { ok: false, reason: "bad-passphrase" };
    }
  }

  if (!(await setEncryptionSalt(null))) {
    // The salt survived, so the record must stay ciphertext. Re-encrypt what is stored.
    const current = await readRawRecord();
    if (current && !isEncryptedRecord(current)) {
      await saveDraft(normalizeRecord(current));
    }
    return { ok: false, reason: "error" };
  }
  lockDraft();
  return { ok: true };
}

/** Unlocks the draft for this tab. Returns the snapshot when a ciphertext record exists. */
export async function unlockDraft(passphrase: string): Promise<DraftUnlockResult> {
  if (!isDraftEncryptionSupported()) return { ok: false, reason: "unsupported" };
  let salt: EncryptionSalt | null;
  try {
    salt = await getEncryptionSalt();
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!salt) return { ok: false, reason: "no-encryption" };

  const saltBytes = base64ToBytes(salt.salt);
  const key = await deriveKey(passphrase, saltBytes, salt.iterations);
  const raw = await readRawRecord();

  if (raw && isEncryptedRecord(raw)) {
    try {
      const snapshot = await decryptSnapshot(raw.encrypted, key);
      cachedKey = key;
      cachedSalt = saltBytes;
      cachedIterations = salt.iterations;
      announceUnlocked();
      return { ok: true, snapshot };
    } catch {
      return { ok: false, reason: "bad-passphrase" };
    }
  }

  // Encryption is enabled but no draft exists yet: cache the key for future saves.
  cachedKey = key;
  cachedSalt = saltBytes;
  cachedIterations = salt.iterations;
  announceUnlocked();
  return { ok: true, snapshot: null };
}

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

async function readRawRecord(now: number = Date.now()): Promise<StoredRecord | null> {
  if (!isDraftStorageAvailable()) return null;
  try {
    const raw = await runRequest<StoredRecord | undefined>(
      SNAPSHOT_STORE,
      "readonly",
      (store) => store.get(DRAFT_KEY)
    );
    if (!raw || typeof raw.savedAt !== "number") return null;
    if (now - raw.savedAt > DRAFT_MAX_AGE_MS) {
      // Remove the record directly: expiry must not revoke unrelated blob URLs.
      await runRequest(SNAPSHOT_STORE, "readwrite", (store) => store.delete(DRAFT_KEY));
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

async function putPlainRecord(snapshot: DraftSnapshot): Promise<void> {
  // Copy the bytes so a later in-place edit of the live buffer cannot mutate the record.
  const record: PlainRecord = { ...snapshot, pdfBytes: snapshot.pdfBytes.slice() };
  await runRequest(SNAPSHOT_STORE, "readwrite", (store) => store.put(record, DRAFT_KEY));
}

async function putEncryptedRecord(record: EncryptedRecord): Promise<void> {
  await runRequest(SNAPSHOT_STORE, "readwrite", (store) => store.put(record, DRAFT_KEY));
}

async function removeRecord(): Promise<void> {
  if (!isDraftStorageAvailable()) return;
  try {
    await runRequest(SNAPSHOT_STORE, "readwrite", (store) => store.delete(DRAFT_KEY));
  } catch {
    // Storage unavailable or evicted: there is nothing left to clear.
  }
}

/**
 * Reads the stored draft without decrypting it. A locked record exposes only the
 * metadata the restore/unlock prompt needs; the bytes stay ciphertext.
 */
export async function readDraftRecord(now: number = Date.now()): Promise<DraftRecord | null> {
  const raw = await readRawRecord(now);
  if (!raw) return null;
  if (isEncryptedRecord(raw)) {
    return {
      kind: "locked",
      meta: { fileName: raw.fileName, savedAt: raw.savedAt, size: raw.size },
    };
  }
  return { kind: "plain", snapshot: normalizeRecord(raw) };
}

export async function saveDraft(snapshot: DraftSnapshot): Promise<DraftSaveResult> {
  const size = estimateDraftBytes(snapshot);
  if (!isDraftStorageAvailable()) return { ok: false, reason: "unavailable", size };
  if (size > DRAFT_MAX_BYTES) return { ok: false, reason: "too-large", size };

  try {
    if (await isDraftEncryptionEnabled()) {
      if (!cachedKey || !cachedSalt) return { ok: false, reason: "locked", size };
      const payload = await encryptSnapshot(snapshot, cachedKey, cachedSalt, cachedIterations);
      await putEncryptedRecord({
        savedAt: snapshot.savedAt,
        fileName: snapshot.fileName,
        size,
        encrypted: payload,
      });
      return { ok: true, size };
    }

    await putPlainRecord(snapshot);
    return { ok: true, size };
  } catch (error) {
    if (isQuotaError(error)) return { ok: false, reason: "quota", size };
    return { ok: false, reason: "error", size };
  }
}

/** Deletes the stored draft and releases every tracked object URL. */
export async function clearDraft(): Promise<void> {
  await removeRecord();
  revokeAllTrackedObjectUrls();
}

/** Alias used by the per-draft "delete now" control. */
export const deleteDraft = clearDraft;

export async function getDraft(now: number = Date.now()): Promise<DraftSnapshot | null> {
  const record = await readDraftRecord(now);
  if (!record) return null;
  if (record.kind === "plain") return record.snapshot;
  if (!cachedKey) return null;
  const raw = await readRawRecord(now);
  if (!raw || !isEncryptedRecord(raw)) return null;
  try {
    return await decryptSnapshot(raw.encrypted, cachedKey);
  } catch {
    return null;
  }
}

/** Autosave preference (a boolean preference, never document content). Defaults to ON. */
export async function getAutosaveEnabled(): Promise<boolean> {
  if (!isDraftStorageAvailable()) return false;
  try {
    const value = await runRequest<boolean | undefined>(
      PREFS_STORE,
      "readonly",
      (store) => store.get(AUTOSAVE_PREF)
    );
    return value !== false;
  } catch {
    return false;
  }
}

export async function setAutosaveEnabled(enabled: boolean): Promise<void> {
  if (!isDraftStorageAvailable()) return;
  try {
    await runRequest(PREFS_STORE, "readwrite", (store) =>
      store.put(enabled, AUTOSAVE_PREF)
    );
  } catch {
    // Preference is best-effort; autosave will simply keep its default.
  }
}

/** Whether the one-time "drafts are stored locally" notice has been shown. */
export async function getAutosaveNoticeShown(): Promise<boolean> {
  if (!isDraftStorageAvailable()) return true;
  try {
    const value = await runRequest<boolean | undefined>(
      PREFS_STORE,
      "readonly",
      (store) => store.get(NOTICE_PREF)
    );
    return value === true;
  } catch {
    return true;
  }
}

export async function setAutosaveNoticeShown(shown: boolean): Promise<void> {
  if (!isDraftStorageAvailable()) return;
  try {
    await runRequest(PREFS_STORE, "readwrite", (store) =>
      store.put(shown, NOTICE_PREF)
    );
  } catch {
    // Same as above: disclosure is best-effort, never fatal to editing.
  }
}

export interface AutosaveOptions {
  debounceMs?: number;
  ceilingMs?: number;
  /** Injected in tests. */
  save?: (snapshot: DraftSnapshot) => Promise<DraftSaveResult | void>;
  isEnabled?: () => Promise<boolean>;
  onSaved?: (snapshot: DraftSnapshot) => void;
  /** Fires once when a save fails in a way that requires user action. */
  onProblem?: (failure: { reason: DraftSaveFailureReason; size: number }) => void;
  now?: () => number;
}

const SNAPSHOT_KEYS = [
  "pdfBytes",
  "dirty",
  "fileName",
  "annotations",
  "stickyNotes",
  "formFields",
  "ocrPages",
  "images",
  "redactions",
  "comments",
  "textObjects",
] as const;

function relevantRefs(state: SnapshotState): unknown[] {
  return SNAPSHOT_KEYS.map((key) => state[key]);
}

/**
 * Watches the store and checkpoints a draft ~4s after the last edit, with a hard
 * ceiling of every 30s so a continuous editing session still gets saved.
 * Returns a stop function.
 *
 * A save that fails for quota, size or lock reasons pauses the loop until the
 * caller restarts it; silently retrying a full disk or a locked draft is what used
 * to break crash recovery without telling anyone.
 */
export function startAutosave(options: AutosaveOptions = {}): () => void {
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const ceilingMs = options.ceilingMs ?? AUTOSAVE_CEILING_MS;
  const save = options.save ?? saveDraft;
  const isEnabled = options.isEnabled ?? getAutosaveEnabled;
  const now = options.now ?? Date.now;

  let pending = false;
  let stopped = false;
  let flushing = false;
  let paused = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    if (stopped || flushing || paused || !pending) return;
    pending = false;
    flushing = true;
    try {
      if (!(await isEnabled())) return;
      const state = useEditorStore.getState();
      if (!state.dirty || !state.pdfBytes) return;
      const snapshot = snapshotFromState(state, now());
      if (!snapshot) return;
      const result = await save(snapshot);
      if (result && !result.ok) {
        paused = true;
        pending = false;
        options.onProblem?.({
          reason: result.reason ?? "error",
          size: result.size,
        });
        return;
      }
      options.onSaved?.(snapshot);
    } catch {
      // A full disk or private-mode failure must never interrupt editing.
      paused = true;
      options.onProblem?.({ reason: "error", size: 0 });
    } finally {
      flushing = false;
    }
  };

  let lastRefs = relevantRefs(useEditorStore.getState());

  const resume = () => {
    if (stopped) return;
    paused = false;
    pending = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void flush(), debounceMs);
  };

  if (typeof window !== "undefined") {
    window.addEventListener(DRAFT_UNLOCKED_EVENT, resume);
  }

  const schedule = () => {
    if (paused) return;
    pending = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void flush(), debounceMs);
  };

  const unsubscribe = useEditorStore.subscribe((state) => {
    const next = relevantRefs(state);
    const changed = next.some((value, index) => value !== lastRefs[index]);
    lastRefs = next;
    if (changed) schedule();
  });

  // Continuous editing keeps resetting the debounce; this guarantees a checkpoint.
  const ceiling = setInterval(() => {
    if (paused) return;
    if (pending) void flush();
  }, ceilingMs);

  return () => {
    stopped = true;
    pending = false;
    unsubscribe();
    clearInterval(ceiling);
    if (debounceTimer) clearTimeout(debounceTimer);
    if (typeof window !== "undefined") {
      window.removeEventListener(DRAFT_UNLOCKED_EVENT, resume);
    }
  };
}

/**
 * Standard unsaved-changes guard. Purely a safety net: it reads the store's dirty
 * flag and never touches draft storage.
 */
export function installBeforeUnloadWarning(): () => void {
  const handler = (event: BeforeUnloadEvent) => {
    if (!useEditorStore.getState().dirty) return;
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}
// fake-indexeddb provides the IndexedDB API that jsdom does not implement.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_CEILING_MS,
  DRAFT_MAX_AGE_MS,
  DRAFT_MAX_BYTES,
  clearDraft,
  disableDraftEncryption,
  enableDraftEncryption,
  getAutosaveEnabled,
  getDraft,
  installBeforeUnloadWarning,
  isDraftEncryptionEnabled,
  lockDraft,
  readDraftRecord,
  saveDraft,
  setAutosaveEnabled,
  snapshotFromState,
  startAutosave,
  unlockDraft,
  type DraftSnapshot,
} from "@/lib/storage/draft-store";
import {
  createTrackedObjectUrl,
  trackedObjectUrlCount,
} from "@/lib/storage/object-urls";
import { useEditorStore } from "@/store/editor-store";
import type { AnnotationItem } from "@/lib/types";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function annotation(id: string): AnnotationItem {
  return {
    id,
    type: "highlight",
    pageIndex: 0,
    color: "#FFD600",
    rects: [{ x: 10, y: 20, width: 30, height: 8 }],
  };
}

function snapshot(over: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    fileName: "recovered.pdf",
    pdfBytes: PDF_BYTES,
    savedAt: Date.now(),
    annotations: [annotation("a1")],
    stickyNotes: [
      { id: "n1", pageIndex: 0, x: 5, y: 6, text: "note", author: "me", date: "today", scale: 1 },
    ],
    formFields: [
      { id: "f1", name: "text_1", type: "text", pageIndex: 0, x: 1, y: 2, width: 30, height: 12 },
    ],
    ocrPages: [{ pageIndex: 0, text: "hello", words: [], createdAt: 1 }],
    images: [
      { id: "i1", pageIndex: 0, x: 1, y: 1, width: 10, height: 10, rotation: 0 },
    ],
    redactions: [{ id: "r1", pageIndex: 0, x: 1, y: 2, width: 3, height: 4 }],
    comments: [
      {
        id: "c1",
        pageIndex: 0,
        author: "me",
        date: "today",
        text: "note",
        type: "sticky",
        status: "Open",
        replies: [],
      },
    ],
    textObjects: [
      {
        id: "t1",
        pageIndex: 0,
        text: "placed",
        x: 4,
        y: 5,
        width: 40,
        height: 12,
        fontSize: 12,
        fontFamily: "Helvetica, Arial, sans-serif",
        color: "#111111",
        rotation: 0,
      },
    ],
    dirty: true,
    ...over,
  };
}

const stops: Array<() => void> = [];

beforeEach(async () => {
  useEditorStore.getState().resetDocument();
  await clearDraft();
  lockDraft();
  await disableDraftEncryption("reset-passphrase");
  await setAutosaveEnabled(true);
});

afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
  useEditorStore.getState().resetDocument();
  await clearDraft();
  lockDraft();
  await disableDraftEncryption("reset-passphrase");
  await setAutosaveEnabled(true);
});

describe("draft snapshot round trip", () => {
  it("stores every unsaved edit slice and the document bytes", async () => {
    const original = snapshot();
    await saveDraft(original);

    const restored = await getDraft();
    expect(restored).not.toBeNull();
    expect(restored!.fileName).toBe("recovered.pdf");
    expect(restored!.savedAt).toBe(original.savedAt);
    expect(restored!.pdfBytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(restored!.pdfBytes)).toEqual(Array.from(PDF_BYTES));
    expect(restored!.annotations).toEqual([annotation("a1")]);
    expect(restored!.stickyNotes[0].text).toBe("note");
    expect(restored!.formFields[0].name).toBe("text_1");
    expect(restored!.ocrPages[0].text).toBe("hello");
    expect(restored!.images[0].id).toBe("i1");
    expect(restored!.redactions[0].id).toBe("r1");
    expect(restored!.textObjects[0].text).toBe("placed");
    expect(restored!.dirty).toBe(true);
  });

  it("never stores the live pdf.js proxy", async () => {
    await saveDraft(snapshot());
    const restored = await getDraft();
    expect(restored && "pdfDocProxy" in restored).toBe(false);
  });

  it("copies bytes so later mutation of the live buffer cannot change the draft", async () => {
    const live = PDF_BYTES.slice();
    await saveDraft(snapshot({ pdfBytes: live }));
    live[0] = 0x00;
    const restored = await getDraft();
    expect(restored!.pdfBytes[0]).toBe(0x25);
  });
});

describe("expiry and clearing", () => {
  it("returns null and deletes a draft older than 48 hours", async () => {
    const now = Date.now();
    await saveDraft(snapshot({ savedAt: now - DRAFT_MAX_AGE_MS - 1 }));
    expect(await getDraft(now)).toBeNull();
    // The expired record is removed, so a second read is also empty.
    expect(await getDraft(now)).toBeNull();
  });

  it("keeps a draft inside the 48 hour window", async () => {
    const now = Date.now();
    await saveDraft(snapshot({ savedAt: now - DRAFT_MAX_AGE_MS + 60_000 }));
    expect(await getDraft(now)).not.toBeNull();
  });

  it("clearDraft removes the stored snapshot", async () => {
    await saveDraft(snapshot());
    await clearDraft();
    expect(await getDraft()).toBeNull();
  });
});

describe("autosave preferences", () => {
  it("defaults to enabled", async () => {
    expect(await getAutosaveEnabled()).toBe(true);
  });

  it("persists the opt-out", async () => {
    await setAutosaveEnabled(false);
    expect(await getAutosaveEnabled()).toBe(false);
  });
});

describe("autosave scheduling", () => {
  it("saves once, 4s after the last edit", async () => {
    vi.useFakeTimers();
    const save = vi.fn<(snapshot: DraftSnapshot) => Promise<void>>(async () => undefined);
    stops.push(startAutosave({ save, isEnabled: async () => true }));

    useEditorStore.setState({ pdfBytes: PDF_BYTES, fileName: "x.pdf", dirty: true });
    useEditorStore.setState({ annotations: [annotation("a1")] });
    await vi.advanceTimersByTimeAsync(3000);
    useEditorStore.setState({ annotations: [annotation("a1"), annotation("a2")] });

    await vi.advanceTimersByTimeAsync(3999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({ fileName: "x.pdf", dirty: true });
  });

  it("ignores state changes that do not touch document content", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    useEditorStore.setState({ pdfBytes: PDF_BYTES, dirty: true });
    stops.push(startAutosave({ save, isEnabled: async () => true }));

    useEditorStore.setState({ statusMessage: "typing in the status bar" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it("checkpoints every 30s even while edits keep resetting the debounce", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    stops.push(
      startAutosave({ save, isEnabled: async () => true, ceilingMs: AUTOSAVE_CEILING_MS })
    );
    useEditorStore.setState({ pdfBytes: PDF_BYTES, dirty: true });

    for (let second = 0; second < 29; second++) {
      useEditorStore.setState({ annotations: [annotation(`a${second}`)] });
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(save).not.toHaveBeenCalled();

    useEditorStore.setState({ annotations: [annotation("a29")] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not autosave when the preference is off or the document is clean", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    stops.push(startAutosave({ save, isEnabled: async () => false }));
    useEditorStore.setState({ pdfBytes: PDF_BYTES, dirty: true });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(save).not.toHaveBeenCalled();

    stops.splice(0).forEach((stop) => stop());
    const dirtySave = vi.fn(async () => undefined);
    stops.push(startAutosave({ save: dirtySave, isEnabled: async () => true }));
    useEditorStore.setState({ pdfBytes: PDF_BYTES, dirty: false });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(dirtySave).not.toHaveBeenCalled();
  });
});

describe("quota and size limits", () => {
  it("refuses a document whose snapshot exceeds the per-document cap", async () => {
    const result = await saveDraft(snapshot({ pdfBytes: new Uint8Array(DRAFT_MAX_BYTES + 1) }));

    expect(result).toMatchObject({ ok: false, reason: "too-large" });
    expect(result.size).toBeGreaterThan(DRAFT_MAX_BYTES);
    expect(await getDraft()).toBeNull();
  });

  it("still stores a document just under the cap", async () => {
    const result = await saveDraft(snapshot({ pdfBytes: new Uint8Array(DRAFT_MAX_BYTES - 4_096) }));

    expect(result.ok).toBe(true);
    expect(await getDraft()).not.toBeNull();
  });

  it("maps an IndexedDB quota failure to an explicit result", async () => {
    const proto = IDBObjectStore.prototype as unknown as { put: unknown };
    const original = proto.put;
    proto.put = () => {
      throw new DOMException("The quota has been exceeded", "QuotaExceededError");
    };
    try {
      const result = await saveDraft(snapshot());
      expect(result).toMatchObject({ ok: false, reason: "quota" });
    } finally {
      proto.put = original;
    }
  });

  it("leaves the previous draft intact when a new save is refused", async () => {
    await saveDraft(snapshot({ fileName: "old.pdf" }));
    await saveDraft(snapshot({ fileName: "new.pdf", pdfBytes: new Uint8Array(DRAFT_MAX_BYTES + 1) }));

    const restored = await getDraft();
    expect(restored!.fileName).toBe("old.pdf");
  });
});

describe("autosave failure states", () => {
  it("pauses autosave when the draft is too large", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ ok: false as const, reason: "too-large" as const, size: 10 }));
    const onProblem = vi.fn();
    stops.push(startAutosave({ save, isEnabled: async () => true, onProblem }));
    useEditorStore.setState({ pdfBytes: PDF_BYTES, dirty: true });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenCalledWith(expect.objectContaining({ reason: "too-large" }));

    // Further edits and ceiling ticks must not retry a paused save.
    useEditorStore.setState({ annotations: [annotation("a1")] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_CEILING_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenCalledTimes(1);
  });

  it("pauses autosave when browser storage is full", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ ok: false as const, reason: "quota" as const, size: 10 }));
    const onProblem = vi.fn();
    stops.push(startAutosave({ save, isEnabled: async () => true, onProblem }));
    useEditorStore.setState({ pdfBytes: PDF_BYTES, dirty: true });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(onProblem).toHaveBeenCalledWith(expect.objectContaining({ reason: "quota" }));
  });

  it("pauses autosave while the draft is locked", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ ok: false as const, reason: "locked" as const, size: 10 }));
    const onProblem = vi.fn();
    stops.push(startAutosave({ save, isEnabled: async () => true, onProblem }));
    useEditorStore.setState({ pdfBytes: PDF_BYTES, dirty: true });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(onProblem).toHaveBeenCalledWith(expect.objectContaining({ reason: "locked" }));
  });

  it("resumes after any control reports the draft unlocked", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const save = vi.fn(async () => {
      attempt += 1;
      return attempt === 1
        ? { ok: false as const, reason: "locked" as const, size: 10 }
        : { ok: true as const, size: 10 };
    });
    stops.push(startAutosave({ save, isEnabled: async () => true }));
    useEditorStore.setState({ pdfBytes: PDF_BYTES, dirty: true });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(save).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("anydoc:draft-unlocked"));
    await vi.advanceTimersByTimeAsync(4_000);
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("passphrase encryption", () => {
  const PASSPHRASE = "correct horse battery staple";

  it("never writes a decrypted encrypted PDF to a plaintext draft", () => {
    useEditorStore.setState({
      pdfBytes: PDF_BYTES,
      fileName: "secret.pdf",
      dirty: true,
      pdfDecrypted: true,
    });
    expect(snapshotFromState(useEditorStore.getState())).toBeNull();
  });

  it("encrypts the stored snapshot and reports it as locked", async () => {
    useEditorStore.setState({ pdfBytes: PDF_BYTES, fileName: "secret.pdf", dirty: true });
    const plain = snapshotFromState(useEditorStore.getState())!;
    await saveDraft(plain);

    const enabled = await enableDraftEncryption(PASSPHRASE);
    expect(enabled.ok).toBe(true);
    expect(await isDraftEncryptionEnabled()).toBe(true);

    const record = await readDraftRecord();
    expect(record?.kind).toBe("locked");
    if (record?.kind !== "locked") throw new Error("expected a locked record");
    expect(record.meta.fileName).toBe("secret.pdf");
    // The locked record exposes metadata for the prompt, never the document bytes.
    expect("pdfBytes" in record).toBe(false);

    // A fresh tab has no cached key, so the draft is unreadable until unlocked.
    lockDraft();
    expect(await getDraft()).toBeNull();
  });

  it("round-trips the snapshot through unlock", async () => {
    useEditorStore.setState({ pdfBytes: PDF_BYTES, fileName: "secret.pdf", dirty: true });
    const plain = snapshotFromState(useEditorStore.getState())!;
    await saveDraft(plain);
    await enableDraftEncryption(PASSPHRASE);
    lockDraft();

    const unlocked = await unlockDraft(PASSPHRASE);
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok || !unlocked.snapshot) throw new Error("expected a snapshot");
    expect(unlocked.snapshot.fileName).toBe("secret.pdf");
    expect(Array.from(unlocked.snapshot.pdfBytes)).toEqual(Array.from(PDF_BYTES));

    const restored = await getDraft();
    expect(restored).not.toBeNull();
    expect(restored!.dirty).toBe(true);
  });

  it("rejects a wrong passphrase without exposing the snapshot", async () => {
    useEditorStore.setState({ pdfBytes: PDF_BYTES, fileName: "secret.pdf", dirty: true });
    await saveDraft(snapshotFromState(useEditorStore.getState())!);
    await enableDraftEncryption(PASSPHRASE);
    lockDraft();

    const result = await unlockDraft("not the passphrase");
    expect(result).toMatchObject({ ok: false, reason: "bad-passphrase" });
    expect(await getDraft()).toBeNull();
  });

  it("refuses a passphrase shorter than the minimum", async () => {
    const result = await enableDraftEncryption("short");
    expect(result).toMatchObject({ ok: false, reason: "weak" });
    expect(await isDraftEncryptionEnabled()).toBe(false);
  });

  it("does not write plaintext when encryption is on but the draft is locked", async () => {
    useEditorStore.setState({ pdfBytes: PDF_BYTES, fileName: "secret.pdf", dirty: true });
    await saveDraft(snapshotFromState(useEditorStore.getState())!);
    await enableDraftEncryption(PASSPHRASE);
    lockDraft();

    const result = await saveDraft(snapshot({ fileName: "second.pdf" }));
    expect(result).toMatchObject({ ok: false, reason: "locked" });

    const record = await readDraftRecord();
    expect(record?.kind).toBe("locked");
    if (record?.kind !== "locked") throw new Error("expected a locked record");
    expect(record.meta.fileName).toBe("secret.pdf");
  });

  it("decrypts back to plaintext when encryption is turned off", async () => {
    useEditorStore.setState({ pdfBytes: PDF_BYTES, fileName: "secret.pdf", dirty: true });
    await saveDraft(snapshotFromState(useEditorStore.getState())!);
    await enableDraftEncryption(PASSPHRASE);

    const disabled = await disableDraftEncryption(PASSPHRASE);
    expect(disabled.ok).toBe(true);
    expect(await isDraftEncryptionEnabled()).toBe(false);

    const record = await readDraftRecord();
    expect(record?.kind).toBe("plain");
    expect((await getDraft())!.fileName).toBe("secret.pdf");
  });
});

describe("delete now", () => {
  it("clears the stored draft and revokes tracked blob URLs", async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const created: string[] = [];
    const revoked: string[] = [];
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:draft-${created.length}`;
      created.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });

    try {
      await saveDraft(snapshot());
      const url = createTrackedObjectUrl(new Blob(["preview"]));
      expect(trackedObjectUrlCount()).toBe(1);

      await clearDraft();

      expect(await getDraft()).toBeNull();
      expect(revoked).toContain(url);
      expect(trackedObjectUrlCount()).toBe(0);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

describe("beforeunload guard", () => {
  it("only arms while the store is dirty", () => {
    const remove = installBeforeUnloadWarning();
    try {
      useEditorStore.setState({ dirty: false });
      const clean = new Event("beforeunload", { cancelable: true });
      const cleanPrevent = vi.spyOn(clean, "preventDefault");
      window.dispatchEvent(clean);
      expect(cleanPrevent).not.toHaveBeenCalled();

      useEditorStore.setState({ dirty: true });
      const dirty = new Event("beforeunload", { cancelable: true });
      const dirtyPrevent = vi.spyOn(dirty, "preventDefault");
      window.dispatchEvent(dirty);
      expect(dirtyPrevent).toHaveBeenCalled();
    } finally {
      remove();
    }
  });
});

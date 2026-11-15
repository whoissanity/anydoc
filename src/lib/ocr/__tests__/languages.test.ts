import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OCR_LANGUAGE,
  OCR_LANGUAGE_STORAGE_KEY,
  ocrLanguageForLocale,
  savedOcrLanguage,
  saveOcrLanguage,
} from "@/lib/ocr/languages";
import { useEditorStore } from "@/store/editor-store";

beforeEach(() => {
  window.localStorage.clear();
});

describe("OCR language preference", () => {
  it("maps UI locales to OCR scripts", () => {
    expect(ocrLanguageForLocale("ru")).toBe("rus");
    expect(ocrLanguageForLocale("zh-TW")).toBe("chi_tra");
    expect(DEFAULT_OCR_LANGUAGE).toBe("eng");
  });

  it("has no saved choice until the user picks one", () => {
    expect(savedOcrLanguage()).toBeNull();
  });

  it("persists an explicit choice", () => {
    saveOcrLanguage("deu");
    expect(window.localStorage.getItem(OCR_LANGUAGE_STORAGE_KEY)).toBe("deu");
    expect(savedOcrLanguage()).toBe("deu");
  });

  it("ignores unsupported stored values", () => {
    window.localStorage.setItem(OCR_LANGUAGE_STORAGE_KEY, "klingon");
    expect(savedOcrLanguage()).toBeNull();
  });

  it("falls back to no choice when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(savedOcrLanguage()).toBeNull();
    vi.restoreAllMocks();
  });

  it("follows the UI language until an explicit choice is made, then keeps it", () => {
    const state = useEditorStore.getState();

    state.hydrateOcrLanguage("ru");
    expect(useEditorStore.getState().ocrLanguage).toBe("rus");

    state.hydrateOcrLanguage("fr");
    expect(useEditorStore.getState().ocrLanguage).toBe("fra");

    state.setOcrLanguage("deu");
    expect(window.localStorage.getItem(OCR_LANGUAGE_STORAGE_KEY)).toBe("deu");

    // Changing the interface must no longer retarget recognition after a choice.
    useEditorStore.getState().hydrateOcrLanguage("ja");
    expect(useEditorStore.getState().ocrLanguage).toBe("deu");
  });
});

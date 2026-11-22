import type { Locale } from "@/lib/i18n/config";

/** Tesseract language codes supported by the shipped configuration. */
export interface OcrLanguage {
  code: string;
  label: string;
}

export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: "eng", label: "English" },
  { code: "spa", label: "Español" },
  { code: "fra", label: "Français" },
  { code: "deu", label: "Deutsch" },
  { code: "por", label: "Português" },
  { code: "ita", label: "Italiano" },
  { code: "nld", label: "Nederlands" },
  { code: "pol", label: "Polski" },
  { code: "rus", label: "Русский" },
  { code: "ukr", label: "Українська" },
  { code: "tur", label: "Türkçe" },
  { code: "chi_sim", label: "简体中文" },
  { code: "chi_tra", label: "繁體中文" },
  { code: "jpn", label: "日本語" },
  { code: "kor", label: "한국어" },
  { code: "vie", label: "Tiếng Việt" },
  { code: "ind", label: "Bahasa Indonesia" },
  { code: "tha", label: "ไทย" },
  { code: "hin", label: "हिन्दी" },
  { code: "ben", label: "বাংলা" },
  { code: "ara", label: "العربية" },
  { code: "fas", label: "فارسی" },
  { code: "urd", label: "اردو" },
];

export const DEFAULT_OCR_LANGUAGE = "eng";

const OCR_LANGUAGE_BY_LOCALE: Record<Locale, string> = {
  en: "eng",
  es: "spa",
  fr: "fra",
  de: "deu",
  pt: "por",
  it: "ita",
  nl: "nld",
  pl: "pol",
  ru: "rus",
  uk: "ukr",
  tr: "tur",
  "zh-CN": "chi_sim",
  "zh-TW": "chi_tra",
  ja: "jpn",
  ko: "kor",
  vi: "vie",
  id: "ind",
  th: "tha",
  hi: "hin",
  bn: "ben",
  ar: "ara",
  fa: "fas",
  ur: "urd",
};

/** The UI language picks the OCR language; unknown locales fall back to English. */
export function ocrLanguageForLocale(locale: Locale): string {
  return OCR_LANGUAGE_BY_LOCALE[locale] ?? DEFAULT_OCR_LANGUAGE;
}

/** Non-content preference, stored like the UI locale and never sent anywhere. */
export const OCR_LANGUAGE_STORAGE_KEY = "anydoc.ocrLanguage";

export function isOcrLanguage(value: unknown): value is string {
  return typeof value === "string" && OCR_LANGUAGES.some((language) => language.code === value);
}

/** The user's explicit OCR choice, or null while OCR still follows the UI language. */
export function savedOcrLanguage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(OCR_LANGUAGE_STORAGE_KEY);
    return isOcrLanguage(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function saveOcrLanguage(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OCR_LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Preference is best-effort only.
  }
}


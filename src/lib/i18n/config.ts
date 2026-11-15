/** Languages shipped with the app. Each JSON lives in `src/locales/<code>.json`. */
export const LOCALES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "nl",
  "pl",
  "ru",
  "uk",
  "tr",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
  "vi",
  "id",
  "th",
  "hi",
  "bn",
  "ar",
  "fa",
  "ur",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Right-to-left scripts get `dir="rtl"` on <html>. */
export const RTL_LOCALES: readonly Locale[] = ["ar", "fa", "ur"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  ru: "Русский",
  uk: "Українська",
  tr: "Türkçe",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  th: "ไทย",
  hi: "हिन्दी",
  bn: "বাংলা",
  ar: "العربية",
  fa: "فارسی",
  ur: "اردو",
};

export const LOCALE_STORAGE_KEY = "anydoc.locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

export type MessageVars = Record<string, string | number>;

/** Replaces `{name}`-style placeholders; unknown placeholders are left visible. */
export function formatMessage(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    vars[key] === undefined ? match : String(vars[key])
  );
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  dirFor,
  formatMessage,
  isLocale,
  type Locale,
  type MessageVars,
} from "@/lib/i18n/config";
import { MESSAGES, type MessageKey } from "@/lib/i18n/messages";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: MessageVars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function translate(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  return formatMessage(MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key, vars);
}

/** Providers rendered outside a provider (tests, isolated previews) read English. */
const FALLBACK: I18nValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  // The server cannot read localStorage, so the saved choice is applied after
  // mount; the first client render still matches the server markup.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(stored)) setLocaleState(stored);
    } catch {
      // Storage blocked: stay on the default language.
    }
    setReady(true);
  }, []);

  // Only persist once the stored value has been read, or the default would
  // overwrite the user's choice before it is restored.
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor(locale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Preference is best-effort only.
    }
  }, [locale, ready]);

  const t = useMemo(
    () => (key: MessageKey, vars?: MessageVars) => translate(locale, key, vars),
    [locale]
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale: setLocaleState, t }),
    [locale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? FALLBACK;
}

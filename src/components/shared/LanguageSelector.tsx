"use client";

import { LOCALES, LOCALE_LABELS, isLocale } from "@/lib/i18n/config";
import { useI18n } from "@/components/providers/I18nProvider";

/** Native-name language picker; the choice persists in localStorage. */
export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();

  return (
    <select
      aria-label={t("language.select")}
      title={t("language.label")}
      value={locale}
      onChange={(event) => {
        if (isLocale(event.target.value)) setLocale(event.target.value);
      }}
      style={{
        height: 26,
        maxWidth: 132,
        padding: "0 6px",
        borderRadius: "var(--radius-btn)",
        border: "1px solid var(--c-border-subtle)",
        backgroundColor: "var(--c-surface-raised)",
        color: "var(--c-text)",
        fontSize: 11,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {LOCALES.map((code) => (
<<<<<<< HEAD
        <option key={code} value={code} style={{ color: "#111" }}>
=======
        <option key={code} value={code}>
>>>>>>> origin/v0/anydoc-design-system
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  );
}

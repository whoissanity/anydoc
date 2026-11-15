"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  addUserFont,
  clearUserFonts,
  listUserFonts,
  removeUserFont,
  UserFontStoreError,
} from "@/lib/fonts/user-fonts";
import type { UserFontRecord } from "@/lib/fonts/types";
import {
  registerUserFontFace,
  unregisterUserFontFace,
} from "@/lib/fonts/register-css";
import { useI18n } from "@/components/providers/I18nProvider";

/**
 * Settings for fonts the user adds from disk. Stored in a separate IndexedDB
 * database from the document draft — font files are not document content.
 */
export function LocalFontsControls() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<UserFontRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setFonts(await listUserFonts());
      setError(null);
    } catch {
      setFonts([]);
      setError(t("fonts.unavailable"));
    }
  }, [t]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onAdd = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      for (const file of Array.from(fileList)) {
        const record = await addUserFont(file);
        await registerUserFontFace(record);
      }
      setNotice(t("fonts.added"));
    } catch (err) {
      if (err instanceof UserFontStoreError) {
        const key =
          err.code === "unsupported-type"
            ? "fonts.badType"
            : err.code === "too-large"
              ? "fonts.tooLarge"
              : err.code === "limit"
                ? "fonts.limit"
                : err.code === "quota"
                  ? "fonts.quota"
                  : "fonts.addFailed";
        setError(t(key));
      } else {
        setError(t("fonts.addFailed"));
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    }
  };

  const onRemove = async (id: string) => {
    setBusy(true);
    await removeUserFont(id);
    unregisterUserFontFace(id);
    setBusy(false);
    await refresh();
  };

  const onClear = async () => {
    setBusy(true);
    await clearUserFonts();
    for (const font of fonts) unregisterUserFontFace(font.id);
    setBusy(false);
    await refresh();
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 84,
        zIndex: 95,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
        fontFamily: "inherit",
      }}
    >
      {open && (
        <div
          role="dialog"
          aria-label={t("fonts.title")}
          style={{
            width: 320,
            maxHeight: "min(420px, 60vh)",
            overflow: "auto",
            padding: "14px 16px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-elevated)",
            border: "1px solid var(--c-border-subtle)",
            boxShadow: "var(--shadow-raised-lg)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 12,
            color: "var(--c-text)",
          }}
        >
          <strong style={{ fontSize: 12 }}>{t("fonts.title")}</strong>
          <span style={{ color: "var(--c-text-muted)", lineHeight: 1.5 }}>
            {t("fonts.description")}
          </span>
          <span style={{ color: "var(--c-text-muted)", lineHeight: 1.5, fontSize: 11 }}>
            {t("fonts.disclosure")}
          </span>
          <span style={{ color: "var(--c-text-muted)", lineHeight: 1.5, fontSize: 11 }}>
            {t("fonts.substitution")}
          </span>

          <input
            ref={inputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            multiple
            disabled={busy}
            aria-label={t("fonts.add")}
            onChange={(e) => void onAdd(e.target.files)}
          />

          {fonts.length === 0 ? (
            <span style={{ color: "var(--c-text-subtle)" }}>{t("fonts.empty")}</span>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {fonts.map((font) => (
                <li
                  key={font.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: "var(--radius-btn)",
                    backgroundColor: "var(--c-surface-raised)",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, fontFamily: `"${font.familyName}", sans-serif` }}>
                      {font.familyName}
                    </span>
                    <span style={{ color: "var(--c-text-muted)", fontSize: 10 }}>
                      {font.fileName} · {Math.round(font.byteLength / 1024)} KB
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void onRemove(font.id)}
                    disabled={busy}
                    style={buttonStyle}
                  >
                    {t("fonts.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--c-border-subtle)", paddingTop: 10 }}>
            <button
              type="button"
              onClick={() => void onClear()}
              disabled={busy || fonts.length === 0}
              style={buttonStyle}
            >
              {t("fonts.clearAll")}
            </button>
          </div>

          {notice && <span style={{ color: "var(--c-text-muted)" }}>{notice}</span>}
          {error && (
            <span role="alert" style={{ color: "var(--c-text-muted)" }}>
              {error}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          padding: "6px 12px",
          borderRadius: 999,
          border: "1px solid var(--c-border-subtle)",
          backgroundColor: "var(--c-surface-elevated)",
          boxShadow: "var(--shadow-raised)",
          color: "var(--c-text-muted)",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t("fonts.title")}
      </button>
    </div>
  );
}

const buttonStyle: CSSProperties = {
  padding: "5px 10px",
  borderRadius: "var(--radius-btn)",
  border: "1px solid var(--c-border-strong)",
  backgroundColor: "var(--c-surface-raised)",
  color: "var(--c-text)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

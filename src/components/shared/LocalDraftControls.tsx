"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  clearDraft,
  disableDraftEncryption,
  enableDraftEncryption,
  getAutosaveEnabled,
  isDraftEncryptionEnabled,
  isDraftEncryptionSupported,
  isDraftUnlocked,
  lockDraft,
  readDraftRecord,
  setAutosaveEnabled,
  unlockDraft,
} from "@/lib/storage/draft-store";
import { useI18n } from "@/components/providers/I18nProvider";

/**
 * Always-reachable privacy controls for the local draft: turn autosave off, wipe
 * the stored draft immediately, and opt into passphrase encryption. Preferences
 * and ciphertext live in IndexedDB; the passphrase and derived key never leave
 * this tab's memory and nothing here ever leaves the browser.
 */
export function LocalDraftControls() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [cleared, setCleared] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [encryptionOn, setEncryptionOn] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [supported, setSupported] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [autosave, encryption, record] = await Promise.all([
      getAutosaveEnabled(),
      isDraftEncryptionEnabled(),
      readDraftRecord(),
    ]);
    setEnabled(autosave);
    setEncryptionOn(encryption);
    setUnlocked(isDraftUnlocked());
    setSupported(isDraftEncryptionSupported());
    setHasDraft(record !== null);
    setError(null);
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await setAutosaveEnabled(next);
    if (!next) await clearDraft();
    await refresh();
  };

  const clear = async () => {
    setBusy(true);
    await clearDraft();
    setPassphrase("");
    await refresh();
    setBusy(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 2500);
  };

  const enable = async () => {
    setBusy(true);
    setError(null);
    const result = await enableDraftEncryption(passphrase);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === "weak"
          ? t("draft.passphraseShort")
          : t("draft.encryptionFailed")
      );
      return;
    }
    setPassphrase("");
    await refresh();
  };

  const unlock = async () => {
    setBusy(true);
    setError(null);
    const result = await unlockDraft(passphrase);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === "bad-passphrase" ? t("draft.wrongPassphrase") : t("draft.encryptionFailed")
      );
      return;
    }
    setPassphrase("");
    await refresh();
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    const result = await disableDraftEncryption(passphrase);
    setBusy(false);
    if (!result.ok) {
      setError(t("draft.wrongPassphrase"));
      return;
    }
    setPassphrase("");
    await refresh();
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        // Above the status bar (and the Next.js dev badge, which sits in this corner).
        bottom: 44,
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
          aria-label={t("draft.title")}
          style={{
            width: 300,
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
          <strong style={{ fontSize: 12 }}>{t("draft.title")}</strong>
          <span style={{ color: "var(--c-text-muted)", lineHeight: 1.5 }}>
            {t("draft.description")}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.4 }}>
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                flex: "0 0 auto",
                backgroundColor: encryptionOn ? "var(--c-primary)" : "var(--c-text-muted)",
              }}
            />
            <span style={{ color: "var(--c-text-muted)" }}>
              {encryptionOn ? t("draft.encrypted") : t("draft.unencrypted")}
            </span>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={() => void toggle()}
              aria-label={t("draft.autosave")}
            />
            {t("draft.autosave")}
          </label>

          <div style={{ borderTop: "1px solid var(--c-border-subtle)", paddingTop: 10 }}>
            <strong style={{ fontSize: 11 }}>{t("draft.encryption")}</strong>

            {encryptionOn ? (
              unlocked ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <span style={{ color: "var(--c-text-muted)", lineHeight: 1.4 }}>
                    {t("draft.encrypted")}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => { lockDraft(); void refresh(); }} style={buttonStyle}>
                      {t("draft.lock")}
                    </button>
                    <button type="button" onClick={() => void disable()} disabled={busy} style={buttonStyle}>
                      {t("draft.disableEncryption")}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ color: "var(--c-text-muted)" }}>{t("draft.passphrase")}</span>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && passphrase.length > 0) void unlock();
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      style={inputStyle}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void unlock()}
                    disabled={busy || passphrase.length === 0}
                    style={{ ...buttonStyle, alignSelf: "flex-start" }}
                  >
                    {t("draft.unlock")}
                  </button>
                  {error && <ErrorLine text={error} />}
                </div>
              )
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "var(--c-text-muted)" }}>{t("draft.passphrase")}</span>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && passphrase.length >= 8) void enable();
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    style={inputStyle}
                  />
                </label>
                <span style={{ color: "var(--c-text-muted)", lineHeight: 1.4 }}>
                  {t("draft.encryptionHint")}
                </span>
                {!supported && <ErrorLine text={t("draft.encryptionUnavailable")} />}
                <button
                  type="button"
                  onClick={() => void enable()}
                  disabled={busy || !supported || passphrase.length < 8}
                  style={{ ...buttonStyle, alignSelf: "flex-start" }}
                >
                  {t("draft.enableEncryption")}
                </button>
                {error && <ErrorLine text={error} />}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--c-border-subtle)", paddingTop: 10 }}>
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy || !hasDraft}
              style={buttonStyle}
            >
              {cleared ? t("draft.cleared") : t("draft.deleteNow")}
            </button>
            <button
              type="button"
              onClick={() => void toggle()}
              style={buttonStyle}
            >
              {t("draft.turnOff")}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!open) void refresh();
          setOpen((value) => !value);
        }}
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
        {t("draft.title")}
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
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "5px 8px",
  borderRadius: "var(--radius-btn)",
  border: "1px solid var(--c-border-strong)",
  backgroundColor: "var(--c-surface)",
  color: "var(--c-text)",
  fontSize: 12,
};

function ErrorLine({ text }: { text: string }) {
  return (
    <span role="alert" style={{ color: "var(--c-text-muted)", lineHeight: 1.4 }}>
      {text}
    </span>
  );
}
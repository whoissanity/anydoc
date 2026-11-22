"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useNetworkActivity } from "@/lib/privacy/network-monitor";

/**
 * Shows the tab's live cross-origin request count. Zero is the product claim;
 * this makes it observable instead of a sentence in the README.
 */
export function PrivacyPill() {
  const { t } = useI18n();
  const { active, external, local } = useNetworkActivity();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const count = external.length;
  const clean = count === 0;
  const label = clean
    ? t("privacy.network.pillClean")
    : count === 1
      ? t("privacy.network.pillOne")
      : t("privacy.network.pillMany", { count });

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("privacy.network.aria", { label })}
        title={clean ? t("privacy.network.cleanTitle") : t("privacy.network.dirtyTitle")}
        onClick={() => setOpen((value) => !value)}
        style={{
          height: 22,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "0 8px",
          borderRadius: 999,
          border: "1px solid var(--c-border-subtle)",
          backgroundColor: "var(--c-surface-raised)",
          color: clean ? "var(--success)" : "var(--warning, #d97706)",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {clean ? (
          <ShieldCheck size={12} strokeWidth={2.2} />
        ) : (
          <ShieldAlert size={12} strokeWidth={2.2} />
        )}
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("privacy.network.title")}
          style={{
            position: "absolute",
            right: 0,
            bottom: "calc(100% + 8px)",
            width: 320,
            padding: "14px 16px",
            borderRadius: 12,
            backgroundColor: "var(--c-surface)",
            border: "1px solid var(--c-border-subtle)",
            boxShadow: "var(--shadow-raised, 0 12px 32px rgba(0,0,0,.35))",
            color: "var(--c-text)",
            fontSize: 12,
            lineHeight: 1.5,
            zIndex: 60,
          }}
        >
          <strong style={{ display: "block", marginBottom: 6 }}>{t("privacy.network.title")}</strong>
          <p style={{ margin: "0 0 10px", color: "var(--c-text-muted)" }}>
            {t("privacy.network.explanation")}
          </p>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{t("privacy.network.crossOrigin")}</span>
            <strong style={{ color: clean ? "var(--success)" : "var(--warning, #d97706)" }}>
              {count}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "var(--c-text-muted)" }}>{t("privacy.network.sameOrigin")}</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{local}</span>
          </div>

          {count > 0 && (
            <ul
              style={{
                margin: "8px 0 0",
                paddingLeft: 16,
                color: "var(--c-text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                wordBreak: "break-all",
              }}
            >
              {external.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          )}

          <p style={{ margin: "10px 0 0", color: "var(--c-text-subtle)", fontSize: 11 }}>
            {active ? t("privacy.network.active") : t("privacy.network.inactive")}
          </p>
        </div>
      )}
    </div>
  );
}

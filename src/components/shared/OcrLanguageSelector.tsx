"use client";

import { useEffect, useState } from "react";
import { useEditorStore } from "@/store/editor-store";
import { getPacksSummary, type OcrPackStatus } from "@/lib/ocr/packs";
import { useI18n } from "@/components/providers/I18nProvider";
import { Languages, Settings2 } from "lucide-react";

export function OcrLanguageSelector({ compact = false }: { compact?: boolean }) {
  const ocrLanguage = useEditorStore((s) => s.ocrLanguage);
  const setOcrLanguage = useEditorStore((s) => s.setOcrLanguage);
  const setActiveDialog = useEditorStore((s) => s.setActiveDialog);
  const activeDialog = useEditorStore((s) => s.activeDialog);
  const { locale } = useI18n();

  const [packs, setPacks] = useState<OcrPackStatus[]>([]);

  // Defaults to the UI language's script and keeps following it until the user
  // picks a language here; that explicit choice is then stored on its own.
  useEffect(() => {
    useEditorStore.getState().hydrateOcrLanguage(locale);
  }, [locale]);

  useEffect(() => {
    void getPacksSummary().then((summary) => setPacks(summary.packs));
  }, [activeDialog]);

  const installed = packs.filter((p) => p.installed);
  const missing = packs.filter((p) => !p.installed);

  const currentPack = packs.find((p) => p.code === ocrLanguage);
  const label = currentPack?.label ?? ocrLanguage;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 26,
          backgroundColor: "var(--c-surface-raised)",
          border: "1px solid var(--c-border-subtle)",
          borderRadius: "var(--radius-btn)",
          padding: "0 4px",
          gap: 4,
        }}
      >
        <Languages size={13} style={{ color: "var(--c-text-muted)", marginLeft: 2 }} />
        <select
          aria-label="Recognition language"
          title={`Recognition language (independent of UI language): ${label}`}
          value={ocrLanguage}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "__manage__") {
              setActiveDialog("ocrPacks");
              return;
            }
            const targetPack = packs.find((p) => p.code === val);
            if (targetPack && !targetPack.installed) {
              setActiveDialog("ocrPacks");
              return;
            }
            setOcrLanguage(val);
          }}
          style={{
            height: "100%",
            border: "none",
            backgroundColor: "transparent",
            color: "var(--c-text)",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            outline: "none",
            maxWidth: compact ? 90 : 120,
          }}
        >
          <optgroup label="Installed Languages">
            {installed.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label} ({p.code})
              </option>
            ))}
          </optgroup>
          {missing.length > 0 && (
            <optgroup label="Missing (Import Required)">
              {missing.map((p) => (
                <option key={p.code} value={p.code} style={{ color: "#777" }}>
                  {p.label} (Needs import)
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Manage">
            <option value="__manage__" style={{ fontWeight: "bold" }}>
              ⚙ Manage Language Packs…
            </option>
          </optgroup>
        </select>
      </div>

      <button
        type="button"
        onClick={() => setActiveDialog("ocrPacks")}
        title="Manage OCR Language Packs & view storage usage"
        style={{
          height: 26,
          width: 26,
          display: "grid",
          placeItems: "center",
          borderRadius: "var(--radius-btn)",
          border: "1px solid var(--c-border-subtle)",
          backgroundColor: "var(--c-surface-raised)",
          color: "var(--c-text-muted)",
          cursor: "pointer",
          padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-text)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
      >
        <Settings2 size={13} />
      </button>
    </div>
  );
}

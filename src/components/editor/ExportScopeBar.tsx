"use client";

import { useEditorStore } from "@/store/editor-store";
import { resolveExportScope, type ExportScopeMode } from "@/lib/export/scope";
import { useI18n } from "@/components/providers/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const MODES: Array<{ mode: ExportScopeMode; labelKey: MessageKey }> = [
  { mode: "all", labelKey: "scope.allPages" },
  { mode: "current", labelKey: "scope.currentPage" },
  { mode: "range", labelKey: "scope.range" },
];

/** Chooses which pages converted formats cover; state lives in the store so surfaces stay in sync. */
export function ExportScopeBar() {
  const { t } = useI18n();
  const scope = useEditorStore((s) => s.exportScope);
  const setExportScope = useEditorStore((s) => s.setExportScope);
  const currentPage = useEditorStore((s) => s.currentPage);
  const pageCount = useEditorStore((s) => s.pageCount);

  if (!pageCount) return null;

  const resolved = resolveExportScope(scope, currentPage, pageCount);

  return (
    <div
      style={{
        marginBottom: 14,
        padding: "10px 12px",
        borderRadius: "var(--radius-input)",
        backgroundColor: "var(--c-surface-elevated)",
        border: "1px solid var(--c-border-subtle)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--c-text-muted)",
            marginRight: 4,
          }}
        >
          {t("scope.label")}
        </span>
        {MODES.map(({ mode, labelKey }) => {
          const active = scope.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              onClick={() => setExportScope({ mode })}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 9px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${active ? "var(--c-primary)" : "var(--c-border-subtle)"}`,
                backgroundColor: active ? "var(--c-primary-subtle)" : "transparent",
                color: active ? "var(--c-primary)" : "var(--c-text-muted)",
              }}
            >
              {mode === "current"
                ? t("scope.pageN", { page: Math.min(Math.max(currentPage, 1), pageCount) })
                : t(labelKey)}
            </button>
          );
        })}
        {scope.mode === "range" && (
          <input
            value={scope.range}
            onChange={(e) => setExportScope({ range: e.target.value })}
            placeholder="1-3, 5"
            aria-label={t("scope.rangeLabel")}
            spellCheck={false}
            style={{
              width: 110,
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: "var(--radius-input)",
              border: "1px solid var(--c-border-subtle)",
              backgroundColor: "var(--c-input-bg, transparent)",
              color: "var(--c-text)",
              outline: "none",
            }}
          />
        )}
      </div>
      <div
        style={{
          fontSize: 10.5,
          marginTop: 6,
          color: resolved.error ? "var(--danger)" : "var(--c-text-muted)",
        }}
      >
        {resolved.error ?? t("scope.exportedLocally", { label: resolved.label })}
      </div>
    </div>
  );
}

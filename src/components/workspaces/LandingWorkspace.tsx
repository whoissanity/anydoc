"use client";

import { Upload, FileText, Image as ImageIcon, FileCode } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { FormatSpectrum } from "@/components/shared/FormatSpectrum";
import { PrivacyPill } from "@/components/shared/PrivacyPill";
import { SITE } from "@/lib/site";

export default function LandingWorkspace({
  onOpenFile,
  onCreate,
}: {
  onOpenFile: () => void;
  onCreate: (kind: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        backgroundColor: "var(--c-bg)",
        overflowY: "auto",
        padding: "56px 24px",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        // `file.type` is client-supplied, so untrusted — the opener validates the %PDF- header.
        (
          window as unknown as { __anyDocOpenFile?: (f: File) => void }
        ).__anyDocOpenFile?.(file);
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--c-text-muted)",
            }}
          >
            {SITE.name} / {t("landing.eyebrow")}
          </p>
          <h1 className="display-headline" style={{ margin: 0 }}>
            {t("landing.tagline")}
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 540,
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--c-text-muted)",
            }}
          >
            {t("landing.lede")}
          </p>
        </header>

        <div
          role="button"
          tabIndex={0}
          onClick={onOpenFile}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenFile();
            }
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 20,
            padding: "36px 32px",
            borderRadius: "var(--radius-card)",
            border: "1.5px dashed var(--c-border-strong)",
            backgroundColor: "var(--c-surface-raised)",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--c-text-heading)",
              }}
            >
              {t("landing.dropTitle")}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--c-text-muted)", lineHeight: 1.5 }}>
              {t("landing.dropBody")}
            </p>
          </div>

          <button
            type="button"
            className="btn-primary-rounded"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFile();
            }}
          >
            <Upload size={16} strokeWidth={1.5} />
            <span>{t("landing.selectDocument")}</span>
          </button>

          <FormatSpectrum />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            paddingTop: 20,
            borderTop: "1px solid var(--c-border-subtle)",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--c-text-muted)" }}>
            {t("landing.orStart")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-secondary-rounded" onClick={() => onCreate("text")}>
              <FileText size={14} strokeWidth={1.5} />
              <span>{t("landing.fromText")}</span>
            </button>
            <button type="button" className="btn-secondary-rounded" onClick={() => onCreate("images")}>
              <ImageIcon size={14} strokeWidth={1.5} />
              <span>{t("landing.fromImages")}</span>
            </button>
            <button type="button" className="btn-secondary-rounded" onClick={() => onCreate("html")}>
              <FileCode size={14} strokeWidth={1.5} />
              <span>{t("landing.fromHtml")}</span>
            </button>
            <button type="button" className="btn-secondary-rounded" onClick={() => onCreate("documents")}>
              <FileText size={14} strokeWidth={1.5} />
              <span>{t("landing.fromDocument")}</span>
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--c-text-muted)" }}>
            {t("landing.requestsCounted")}
          </span>
          <PrivacyPill />
        </div>
      </div>
    </div>
  );
}

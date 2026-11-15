"use client";

import { useState } from "react";
import { useEditorStore } from "@/store/editor-store";
import { readPdfFile } from "@/lib/document/validate";
import { EXPORT_SECTIONS, formatMeta } from "@/lib/export/catalog";
import { FormatIcon } from "@/components/shared/FormatIcon";
import { ExportScopeBar } from "./ExportScopeBar";
import { useI18n } from "@/components/providers/I18nProvider";
import type { BatesOptions } from "@/lib/types";
import {
  X,
  ShieldAlert,
  FileCheck,
  EyeOff,
  GitCompare,
  Download,
  CheckCircle2,
  Lock,
} from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  wide,
  width,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--c-overlay)",
        backdropFilter: "blur(3px)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-raised"
        style={{
          width: width ?? (wide ? 560 : 420),
          maxWidth: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          backgroundColor: "var(--c-modal-surface)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          border: "1px solid var(--c-border)",
          borderRadius: "var(--radius-modal)",
          boxShadow: "var(--shadow-raised-lg)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            boxShadow: "var(--shadow-divider-b)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--c-text)" }}>
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: "none",
              display: "grid",
              placeItems: "center",
              padding: 4,
              borderRadius: "var(--radius-btn)",
              color: "var(--c-text-muted)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-text)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div style={{ padding: "20px" }}>{children}</div>
      </div>
    </div>
  );
}

export function OpenPasswordDialog({
  fileName,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  fileName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");

  return (
    <Modal
      title={t("dialog.openPassword.title")}
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <p
        style={{
          margin: 0,
          color: "var(--c-text-muted)",
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        {t("dialog.openPassword.body", { name: fileName })}
      </p>
      <label style={lab} htmlFor="anydoc-open-password">
        {t("dialog.openPassword.password")}
      </label>
      <input
        id="anydoc-open-password"
        style={inp}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && password && !busy) onSubmit(password);
        }}
        placeholder={t("dialog.openPassword.placeholder")}
        aria-label={t("dialog.openPassword.password")}
        autoComplete="current-password"
        autoFocus
        spellCheck={false}
      />
      <p
        style={{
          margin: "8px 0 0",
          color: "var(--c-text-muted)",
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        {t("dialog.openPassword.privacy")}
      </p>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "7px 9px",
            borderRadius: "var(--radius-btn)",
            backgroundColor: "var(--c-danger-subtle, rgba(190, 60, 60, 0.12))",
            color: "var(--c-danger, #b93a3a)",
            fontSize: 11.5,
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 18,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: "7px 12px",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--c-border-strong)",
            backgroundColor: "transparent",
            color: "var(--c-text)",
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(password)}
          disabled={busy || !password}
          style={{
            padding: "7px 14px",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--c-primary)",
            backgroundColor: "var(--c-primary)",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 700,
            cursor: busy || !password ? "not-allowed" : "pointer",
            opacity: busy || !password ? 0.6 : 1,
          }}
        >
          {busy ? t("dialog.openPassword.opening") : t("dialog.openPassword.open")}
        </button>
      </div>
    </Modal>
  );
}

export function BatesDialog({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (opts: BatesOptions) => void;
}) {
  const bates = useEditorStore((s) => s.bates);
  const setBates = useEditorStore((s) => s.setBates);
  const [local, setLocal] = useState(bates);
  const { t } = useI18n();

  return (
    <Modal title={t("dialog.bates.title")} onClose={onClose}>
      <label style={lab}>{t("dialog.bates.prefix")}</label>
      <input
        style={inp}
        value={local.prefix}
        onChange={(e) => setLocal({ ...local, prefix: e.target.value })}
      />
      <label style={lab}>{t("dialog.bates.startNumber")}</label>
      <input
        style={inp}
        type="number"
        value={local.start}
        onChange={(e) => setLocal({ ...local, start: Number(e.target.value) })}
      />
      <label style={lab}>{t("dialog.bates.padding")}</label>
      <input
        style={inp}
        type="number"
        value={local.padding}
        onChange={(e) => setLocal({ ...local, padding: Number(e.target.value) })}
      />
      <label style={lab}>{t("dialog.bates.suffix")}</label>
      <input
        style={inp}
        value={local.suffix}
        onChange={(e) => setLocal({ ...local, suffix: e.target.value })}
      />
      <label style={lab}>{t("dialog.bates.position")}</label>
      <select
        style={inp}
        value={local.position}
        onChange={(e) =>
          setLocal({ ...local, position: e.target.value as BatesOptions["position"] })
        }
      >
        <option value="top-left">{t("dialog.bates.topLeft")}</option>
        <option value="top-right">{t("dialog.bates.topRight")}</option>
        <option value="bottom-left">{t("dialog.bates.bottomLeft")}</option>
        <option value="bottom-right">{t("dialog.bates.bottomRight")}</option>
      </select>
      <label style={lab}>{t("dialog.bates.fontSize")}</label>
      <input
        style={inp}
        type="number"
        value={local.fontSize}
        onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          onClick={() => {
            const opts = { ...local, enabled: true };
            setBates(opts);
            onApply(opts);
          }}
        >
          {t("dialog.bates.apply")}
        </button>
      </div>
    </Modal>
  );
}

export function ConvertDialog({
  onClose,
  onExport,
  onCreate,
  onPdfA,
}: {
  onClose: () => void;
  onExport: (format: string) => void;
  onCreate: (kind: string) => void;
  onPdfA?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={t("dialog.convert.title")} onClose={onClose} wide>
      <div
        className="card-raised"
        onClick={() => onExport("pdf")}
        style={{
          padding: "16px 18px",
          borderRadius: "var(--radius-card)",
          backgroundColor: "var(--c-surface-elevated)",
          border: "1.5px solid var(--c-primary)",
          boxShadow: "var(--shadow-raised)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          marginBottom: 20,
          transition: "transform 140ms ease, box-shadow 140ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.01)";
          e.currentTarget.style.boxShadow = "var(--shadow-raised-lg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "var(--shadow-raised)";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--radius-soft)",
              backgroundColor: "var(--c-btn-bg)",
              color: "var(--c-btn-text)",
              display: "grid",
              placeItems: "center",
              boxShadow: "var(--shadow-raised-sm)",
            }}
          >
            <Download size={22} strokeWidth={2} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--c-text)" }}>
                {t("dialog.convert.exportPdf")}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  backgroundColor: "var(--c-primary-subtle)",
                  color: "var(--c-primary)",
                  padding: "1px 6px",
                  borderRadius: 999,
                }}
              >
                {t("common.recommended")}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--c-text-muted)", marginTop: 2 }}>
              {t("dialog.convert.exportPdfBody")}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary-rounded"
          onClick={(e) => {
            e.stopPropagation();
            onExport("pdf");
          }}
        >
          {t("dialog.convert.downloadPdf")}
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <ExportScopeBar />
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--c-text-muted)",
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {t("dialog.convert.otherFormats")}
          <span style={{ marginLeft: 8, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
            {t("dialog.convert.convertedLocally")}
          </span>
        </div>
        {EXPORT_SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--c-text-muted)",
                marginBottom: 7,
                letterSpacing: "0.04em",
              }}
            >
              {section.title}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(172px, 1fr))",
                gap: 8,
              }}
            >
              {section.ids.map((id) => {
                const meta = formatMeta(id);
                if (!meta) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className="card-raised"
                    title={meta.description}
                    onClick={() => onExport(id)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 9,
                      padding: "10px 11px",
                      borderRadius: "var(--radius-input)",
                      backgroundColor: "var(--c-surface-elevated)",
                      border: "1px solid var(--c-border-subtle)",
                      boxShadow: "var(--shadow-raised-sm)",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--c-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--c-border-subtle)";
                    }}
                  >
                    <span style={{ color: "var(--c-text)", display: "flex", marginTop: 1 }}>
                      <FormatIcon id={id} size={17} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--c-text)",
                        }}
                      >
                        {meta.label}
                        <span
                          style={{
                            marginLeft: 5,
                            fontSize: 10,
                            fontWeight: 500,
                            fontFamily: "var(--font-mono)",
                            color: "var(--c-text-muted)",
                          }}
                        >
                          .{meta.extension}
                        </span>
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 10.5,
                          lineHeight: 1.35,
                          color: "var(--c-text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {meta.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--c-text-muted)",
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {t("dialog.convert.createNew")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            ["images", t("dialog.convert.fromImages")],
            ["text", t("dialog.convert.fromPlainText")],
            ["html", t("dialog.convert.fromHtml")],
            ["documents", t("dialog.convert.fromAnyDocument")],
            ["docx", t("dialog.convert.fromWord")],
            ["xlsx", t("dialog.convert.fromExcel")],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className="card-raised"
              style={{
                padding: "12px 10px",
                borderRadius: "var(--radius-input)",
                backgroundColor: "var(--c-surface-elevated)",
                boxShadow: "var(--shadow-raised-sm)",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--c-text)",
                cursor: "pointer",
                transition: "all 120ms ease",
              }}
              onClick={() => onCreate(k)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--c-btn-bg)";
                e.currentTarget.style.color = "var(--c-btn-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--c-surface-elevated)";
                e.currentTarget.style.color = "var(--c-text)";
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {onPdfA && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--c-text-muted)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Archival
          </div>
          <button
            type="button"
            className="card-raised"
            onClick={onPdfA}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: "var(--radius-input)",
              backgroundColor: "var(--c-surface-elevated)",
              border: "1px solid var(--c-border-subtle)",
              boxShadow: "var(--shadow-raised-sm)",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <span style={{ color: "var(--c-text)", display: "flex" }}>
              <FileCheck size={18} />
            </span>
            <span>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--c-text)" }}>
                PDF/A archival preparation
              </span>
              <span style={{ display: "block", marginTop: 2, fontSize: 10.5, color: "var(--c-text-muted)" }}>
                Add an sRGB output intent, PDF/A-2b XMP metadata, audit fonts, and optionally strip scripts.
              </span>
            </span>
          </button>
        </div>
      )}
    </Modal>
  );
}

export function CreateTextDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (text: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(() => t("dialog.createText.template"));
  return (
    <Modal title={t("dialog.createText.title")} onClose={onClose}>
      <textarea
        style={{
          ...inp,
          minHeight: 180,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          lineHeight: 1.5,
        }}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          onClick={() => onCreate(text)}
        >
          {t("dialog.createText.create")}
        </button>
      </div>
    </Modal>
  );
}

export function RedactionDialog({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (box: { pageIndex: number; x: number; y: number; width: number; height: number }) => void;
}) {
  const currentPage = useEditorStore((s) => s.currentPage);
  const pageCount = useEditorStore((s) => s.pageCount);
  const [page, setPage] = useState(currentPage);
  const [preset, setPreset] = useState<"custom" | "header" | "footer" | "ssn">("header");
  const [x, setX] = useState(72);
  const [y, setY] = useState(700);
  const [width, setWidth] = useState(468);
  const [height, setHeight] = useState(40);
  const { t } = useI18n();

  const applyPreset = (p: "custom" | "header" | "footer" | "ssn") => {
    setPreset(p);
    if (p === "header") {
      setX(72);
      setY(700);
      setWidth(468);
      setHeight(50);
    } else if (p === "footer") {
      setX(72);
      setY(40);
      setWidth(468);
      setHeight(40);
    } else if (p === "ssn") {
      setX(180);
      setY(450);
      setWidth(180);
      setHeight(24);
    }
  };

  return (
    <Modal title={t("dialog.redact.title")} onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--radius-input)",
          backgroundColor: "rgba(255, 69, 58, 0.12)",
          border: "1px solid var(--danger)",
          marginBottom: 16,
          color: "var(--c-text)",
          fontSize: 12,
        }}
      >
        <ShieldAlert size={20} style={{ color: "var(--danger)", flexShrink: 0 }} />
        <span>
          <strong>{t("dialog.redact.warningTitle")}</strong> {t("dialog.redact.warningBody")}
        </span>
      </div>

      <label style={lab}>{t("dialog.redact.targetPage")}</label>
      <input
        type="number"
        min={1}
        max={pageCount || 1}
        value={page}
        onChange={(e) => setPage(Math.max(1, Math.min(pageCount, Number(e.target.value))))}
        style={inp}
      />

      <label style={lab}>{t("dialog.redact.preset")}</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 4 }}>
        {[
          ["header", t("dialog.redact.headerBlock")],
          ["footer", t("dialog.redact.footerStrip")],
          ["ssn", t("dialog.redact.ssnBox")],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="card-raised"
            style={{
              padding: "8px 6px",
              borderRadius: "var(--radius-input)",
              backgroundColor: preset === k ? "var(--c-btn-bg)" : "var(--c-surface-elevated)",
              color: preset === k ? "var(--c-btn-text)" : "var(--c-text)",
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
            }}
            onClick={() => applyPreset(k as "custom" | "header" | "footer" | "ssn")}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div>
          <label style={lab}>{t("dialog.redact.xOffset")}</label>
          <input type="number" value={x} onChange={(e) => setX(Number(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lab}>{t("dialog.redact.yOffset")}</label>
          <input type="number" value={y} onChange={(e) => setY(Number(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lab}>{t("dialog.redact.width")}</label>
          <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lab}>{t("dialog.redact.height")}</label>
          <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} style={inp} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          style={{ backgroundColor: "var(--danger)", color: "#ffffff" }}
          onClick={() => {
            onApply({ pageIndex: page - 1, x, y, width, height });
          }}
        >
          {t("dialog.redact.apply")}
        </button>
      </div>
    </Modal>
  );
}

export function DigitalSignatureDialog({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (info: {
    signerName: string;
    organization?: string;
    reason?: string;
    location?: string;
    date: string;
    hash: string;
  }) => void;
}) {
  const [signerName, setSignerName] = useState("");
  const [organization, setOrganization] = useState("");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const { t } = useI18n();

  return (
    <Modal title={t("dialog.integrity.title")} onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--radius-input)",
          backgroundColor: "rgba(10, 132, 255, 0.12)",
          border: "1px solid var(--c-primary)",
          marginBottom: 16,
          color: "var(--c-text)",
          fontSize: 12,
        }}
      >
        <FileCheck size={20} style={{ color: "var(--c-primary)", flexShrink: 0 }} />
        <span>
          {t("dialog.integrity.info")}
        </span>
      </div>

      <label style={lab}>{t("dialog.integrity.signerName")}</label>
      <input
        style={inp}
        value={signerName}
        placeholder={t("dialog.integrity.signerNamePlaceholder")}
        onChange={(e) => setSignerName(e.target.value)}
      />

      <label style={lab}>{t("dialog.integrity.organization")}</label>
      <input
        style={inp}
        value={organization}
        placeholder={t("dialog.integrity.organizationPlaceholder")}
        onChange={(e) => setOrganization(e.target.value)}
      />

      <label style={lab}>{t("dialog.integrity.reason")}</label>
      <input
        style={inp}
        value={reason}
        placeholder={t("dialog.integrity.reasonPlaceholder")}
        onChange={(e) => setReason(e.target.value)}
      />

      <label style={lab}>{t("dialog.integrity.location")}</label>
      <input
        style={inp}
        value={location}
        placeholder={t("dialog.integrity.locationPlaceholder")}
        onChange={(e) => setLocation(e.target.value)}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          disabled={!signerName.trim()}
          title={t("dialog.integrity.needSigner")}
          style={{ opacity: signerName.trim() ? 1 : 0.5, cursor: signerName.trim() ? "pointer" : "not-allowed" }}
          onClick={() => {
            const dateStr = new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            onApply({
              signerName,
              organization,
              reason,
              location,
              date: dateStr,
              // EditorShell hashes the real bytes; a made-up value would only look like evidence.
              hash: "",
            });
          }}
        >
          {t("dialog.integrity.apply")}
        </button>
      </div>
    </Modal>
  );
}

export function MetadataScrubDialog({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: () => void;
}) {
  const fileName = useEditorStore((s) => s.fileName);
  const { t } = useI18n();
  return (
    <Modal title={t("dialog.metadata.title")} onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--radius-input)",
          backgroundColor: "rgba(48, 209, 88, 0.12)",
          border: "1px solid var(--c-brand)",
          marginBottom: 16,
          color: "var(--c-text)",
          fontSize: 12,
        }}
      >
        <EyeOff size={20} style={{ color: "var(--c-brand)", flexShrink: 0 }} />
        <span>
          {t("dialog.metadata.intro", {
            name: fileName || t("dialog.metadata.thisDocument"),
          })}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--c-text-muted)", marginBottom: 12 }}>
        {t("dialog.metadata.willErase")}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          t("dialog.metadata.fieldTitle"),
          t("dialog.metadata.fieldAuthor"),
          t("dialog.metadata.fieldSubject"),
          t("dialog.metadata.fieldCreator"),
          t("dialog.metadata.fieldProducer"),
          t("dialog.metadata.fieldDates"),
          t("dialog.metadata.fieldHistory"),
        ].map((item) => (
          <li key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--c-text)" }}>
            <CheckCircle2 size={14} style={{ color: "var(--c-brand)" }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          onClick={onApply}
        >
          {t("dialog.metadata.apply")}
        </button>
      </div>
    </Modal>
  );
}

export function PasswordDialog({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (opts: { userPass: string; ownerPass: string; allowPrint: boolean; allowCopy: boolean }) => void;
}) {
  const [userPass, setUserPass] = useState("");
  const [ownerPass, setOwnerPass] = useState("");
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(false);
  const { t } = useI18n();

  return (
    <Modal title={t("dialog.password.title")} onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--radius-input)",
          backgroundColor: "rgba(255, 159, 10, 0.12)",
          border: "1px solid var(--warning)",
          marginBottom: 16,
          color: "var(--c-text)",
          fontSize: 12,
        }}
      >
        <Lock size={20} style={{ color: "var(--warning)", flexShrink: 0 }} />
        <span>
          <strong>{t("dialog.password.unavailableTitle")}</strong>{" "}
          {t("dialog.password.unavailableBody")}
        </span>
      </div>

      <label style={lab}>{t("dialog.password.userPass")}</label>
      <input
        type="password"
        placeholder={t("dialog.password.userPassPlaceholder")}
        value={userPass}
        onChange={(e) => setUserPass(e.target.value)}
        style={inp}
      />

      <label style={lab}>{t("dialog.password.ownerPass")}</label>
      <input
        type="password"
        placeholder={t("dialog.password.ownerPassPlaceholder")}
        value={ownerPass}
        onChange={(e) => setOwnerPass(e.target.value)}
        style={inp}
      />

      <label style={lab}>{t("dialog.password.permissions")}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--c-text)", cursor: "pointer" }}>
          <input type="checkbox" checked={allowPrint} onChange={(e) => setAllowPrint(e.target.checked)} />
          <span>{t("dialog.password.allowPrint")}</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--c-text)", cursor: "pointer" }}>
          <input type="checkbox" checked={allowCopy} onChange={(e) => setAllowCopy(e.target.checked)} />
          <span>{t("dialog.password.allowCopy")}</span>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          disabled
          title={t("dialog.password.requiresDesktop")}
          onClick={() => onApply({ userPass, ownerPass, allowPrint, allowCopy })}
          style={{ opacity: 0.5, cursor: "not-allowed" }}
        >
          {t("dialog.password.unavailableButton")}
        </button>
      </div>
    </Modal>
  );
}

export function DiffDialog({
  onClose,
  onCompareFile,
}: {
  onClose: () => void;
  onCompareFile: (file: File) => void;
}) {
  const fileName = useEditorStore((s) => s.fileName);
  const pageCount = useEditorStore((s) => s.pageCount);
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
  const { t } = useI18n();

  return (
    <Modal title={t("dialog.diff.title")} onClose={onClose} wide>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--radius-input)",
          backgroundColor: "rgba(10, 132, 255, 0.12)",
          border: "1px solid var(--c-primary)",
          marginBottom: 16,
          color: "var(--c-text)",
          fontSize: 12,
        }}
      >
        <GitCompare size={20} style={{ color: "var(--c-primary)", flexShrink: 0 }} />
        <span>
          {t("dialog.diff.info")}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div
          className="card-raised"
          style={{
            padding: 16,
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-elevated)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--c-primary)", textTransform: "uppercase" }}>
            {t("dialog.diff.baseVersion")}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", marginTop: 4 }}>
            {fileName || t("dialog.diff.currentDocument")}
          </div>
          <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 2 }}>
            {t("dialog.diff.pageCount", { count: pageCount })}
          </div>
        </div>

        <div
          className="card-raised"
          style={{
            padding: 16,
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-elevated)",
            border: "1px dashed var(--c-border-strong)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase" }}>
            {t("dialog.diff.comparisonVersion")}
          </div>
          {secondaryFile ? (
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--c-text)" }}>
              {secondaryFile.name}
            </div>
          ) : (
            <>
              <input
                id="diff-file-picker"
                type="file"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    await readPdfFile(f);
                    setSecondaryFile(f);
                  } catch (err) {
                    useEditorStore
                      .getState()
                      .setStatus(err instanceof Error ? err.message : t("dialog.diff.invalidPdf"));
                  }
                }}
              />
              <button
                type="button"
                className="btn-secondary-rounded"
                style={{ marginTop: 8 }}
                onClick={() => document.getElementById("diff-file-picker")?.click()}
              >
                {t("dialog.diff.selectPdf")}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={!secondaryFile}
          className="btn-primary-rounded"
          onClick={() => {
            if (secondaryFile) onCompareFile(secondaryFile);
          }}
        >
          {t("dialog.diff.run")}
        </button>
      </div>
    </Modal>
  );
}

const lab: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--c-text)",
  marginTop: 10,
  marginBottom: 4,
};

const inp: React.CSSProperties = {
  width: "100%",
  backgroundColor: "var(--c-surface-sunken)",
  border: "none",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  fontSize: 12,
  color: "var(--c-text)",
  outline: "none",
  boxShadow: "inset 0 1px 2px rgba(45, 30, 15, 0.08)",
};

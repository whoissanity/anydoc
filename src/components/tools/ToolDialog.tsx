"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/editor/Dialogs";
import { useEditorStore } from "@/store/editor-store";
import { reloadFromBytes } from "@/lib/document/document-service";
import {
  defaultValues,
  getTool,
  type ParamValues,
  type ToolOutcome,
  type ToolParam,
} from "@/lib/tools/catalog";

export function ToolDialog() {
  const activeDialog = useEditorStore((s) => s.activeDialog);
  const activeToolId = useEditorStore((s) => s.activeToolId);
  const setActiveDialog = useEditorStore((s) => s.setActiveDialog);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  const tool = useMemo(() => getTool(activeToolId), [activeToolId]);
  const [values, setValues] = useState<ParamValues>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ToolOutcome | null>(null);

  const close = useCallback(() => {
    setActiveDialog("none");
    setActiveTool(null);
    setOutcome(null);
    setError(null);
    setBusy(false);
  }, [setActiveDialog, setActiveTool]);

  // Reset and seed the form whenever a different tool is opened.
  useEffect(() => {
    if (activeDialog !== "tool" || !tool) return;
    let cancelled = false;
    const seed = defaultValues(tool);
    setValues(seed);
    setOutcome(null);
    setError(null);
    setProgress("");
    setBusy(false);

    if (tool.prepare) {
      const state = useEditorStore.getState();
      if (!state.pdfBytes) return;
      tool
        .prepare({
          bytes: state.pdfBytes,
          fileName: state.fileName || "document.pdf",
          pageCount: state.pageCount,
          currentPage: state.currentPage,
          outline: state.outline,
          onProgress: () => {},
        })
        .then((seeded) => {
          if (!cancelled) setValues((prev) => ({ ...prev, ...seeded }));
        })
        .catch(() => {
          // seeding is best-effort
        });
    }

    return () => {
      cancelled = true;
    };
  }, [activeDialog, tool]);

  if (activeDialog !== "tool" || !tool) return null;

  const hasDocument = !!useEditorStore.getState().pdfBytes;

  const run = async () => {
    const state = useEditorStore.getState();
    if (!state.pdfBytes || !tool.run) return;
    setBusy(true);
    setError(null);
    setProgress("Starting…");
    try {
      const result = await tool.run(
        {
          bytes: state.pdfBytes,
          fileName: state.fileName || "document.pdf",
          pageCount: state.pageCount,
          currentPage: state.currentPage,
          outline: state.outline,
          onProgress: (msg) => setProgress(msg),
        },
        values
      );

      if (result.bytes) {
        await reloadFromBytes(result.bytes, result.rename || state.fileName || "document.pdf");
      } else if (result.rename) {
        useEditorStore.getState().setFileName(result.rename);
      }

      if (result.download) {
        saveAs(result.download.blob, result.download.filename);
      }

      useEditorStore.getState().setStatus(result.message);
      setOutcome(result);

      if (!result.report && !result.download) {
        close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That tool could not finish");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const params = tool.params ?? [];
  let lastGroup = "";

  return (
    <Modal title={tool.name} onClose={close} width={680}>
      <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--c-text-muted)", lineHeight: 1.5 }}>
        {tool.description}
      </p>

      {tool.unavailable && (
        <Banner tone="warn" icon={<AlertTriangle size={16} />}>
          {tool.unavailable}
        </Banner>
      )}

      {outcome?.report ? (
        <ToolReportView outcome={outcome} onClose={close} />
      ) : (
        <>
          {params.map((param) => {
            if (param.showIf && !param.showIf(values)) return null;
            const heading = param.group && param.group !== lastGroup ? param.group : null;
            if (param.group) lastGroup = param.group;
            return (
              <div key={param.key}>
                {heading && (
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: "var(--c-text-subtle)",
                      margin: "16px 0 8px",
                    }}
                  >
                    {heading}
                  </div>
                )}
                <Control
                  param={param}
                  value={values[param.key]}
                  disabled={busy}
                  onChange={(next) => setValues((prev) => ({ ...prev, [param.key]: next }))}
                />
              </div>
            );
          })}

          {error && (
            <div style={{ marginTop: 16 }}>
              <Banner tone="bad" icon={<AlertTriangle size={16} />}>
                {error}
              </Banner>
            </div>
          )}

          {busy && progress && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
                fontSize: 12,
                color: "var(--c-text-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <Loader2 size={14} className="spin" />
              <span>{progress}</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <button type="button" className="btn-secondary-rounded" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary-rounded"
              onClick={() => void run()}
              disabled={busy || !hasDocument || !!tool.unavailable || !tool.run}
            >
              {busy ? "Working…" : tool.downloads ? "Run & download" : "Apply"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Control({
  param,
  value,
  onChange,
  disabled,
}: {
  param: ToolParam;
  value: string | number | boolean | File | null | undefined;
  onChange: (next: string | number | boolean | File | null) => void;
  disabled?: boolean;
}) {
  const label = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 6,
        marginTop: 12,
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text)" }}>{param.label}</span>
      {param.suffix && (
        <span style={{ fontSize: 10.5, color: "var(--c-text-subtle)", fontFamily: "var(--font-mono)" }}>
          {param.suffix}
        </span>
      )}
    </div>
  );

  const hint = param.hint ? (
    <div style={{ fontSize: 10.5, color: "var(--c-text-subtle)", marginTop: 5, lineHeight: 1.4 }}>
      {param.hint}
    </div>
  ) : null;

  if (param.type === "toggle") {
    const checked = Boolean(value);
    return (
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 0",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 12,
          color: "var(--c-text)",
        }}
      >
        <span style={{ fontWeight: 500 }}>{param.label}</span>
        <span
          style={{
            width: 38,
            height: 22,
            borderRadius: 999,
            backgroundColor: checked ? "var(--c-btn-bg)" : "var(--c-surface-quaternary)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
            display: "inline-flex",
            alignItems: "center",
            padding: 2,
            transition: "background-color 140ms ease",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              transform: checked ? "translateX(16px)" : "translateX(0)",
              transition: "transform 140ms ease",
              boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
            }}
          />
        </span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ display: "none" }}
        />
      </label>
    );
  }

  if (param.type === "select") {
    return (
      <div>
        {label}
        <select
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={controlStyle}
        >
          {(param.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {hint}
      </div>
    );
  }

  if (param.type === "range") {
    const current = Number(value ?? param.defaultValue ?? 0);
    const display =
      param.step && param.step < 1 ? current.toFixed(2) : String(Math.round(current));
    return (
      <div>
        {label}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="range"
            min={param.min ?? 0}
            max={param.max ?? 100}
            step={param.step ?? 1}
            value={current}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--c-primary)" }}
          />
          <span
            style={{
              minWidth: 52,
              textAlign: "right",
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              color: "var(--c-text)",
            }}
          >
            {display}
          </span>
        </div>
        {hint}
      </div>
    );
  }

  if (param.type === "color") {
    return (
      <div>
        {label}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="color"
            value={String(value ?? "#000000")}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 38,
              height: 28,
              borderRadius: 8,
              border: "1px solid var(--c-border)",
              backgroundColor: "transparent",
              padding: 2,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--c-text-muted)" }}>
            {String(value ?? "")}
          </span>
        </div>
      </div>
    );
  }

  if (param.type === "file") {
    const file = value instanceof File ? value : null;
    return (
      <div>
        {label}
        <label
          style={{
            ...controlStyle,
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: disabled ? "not-allowed" : "pointer",
            color: file ? "var(--c-text)" : "var(--c-text-muted)",
          }}
        >
          <Upload size={14} strokeWidth={1.7} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "Choose a file…"}
          </span>
          <input
            type="file"
            disabled={disabled}
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
        </label>
        {hint}
      </div>
    );
  }

  if (param.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...controlStyle, minHeight: 74, resize: "vertical", lineHeight: 1.5 }}
        />
        {hint}
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        type={param.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        min={param.min}
        max={param.max}
        step={param.step}
        disabled={disabled}
        onChange={(e) => onChange(param.type === "number" ? Number(e.target.value) : e.target.value)}
        style={controlStyle}
      />
      {hint}
    </div>
  );
}

function ToolReportView({ outcome, onClose }: { outcome: ToolOutcome; onClose: () => void }) {
  const report = outcome.report!;
  const warn = outcome.status === "warn";
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: "var(--radius-input)",
          backgroundColor: warn ? "rgba(255, 159, 10, 0.12)" : "var(--c-brand-subtle)",
          border: warn ? "1px solid var(--warning)" : "1px solid transparent",
          color: "var(--c-text)",
          fontSize: 12.5,
          marginBottom: 16,
        }}
      >
        {warn ? (
          <AlertTriangle size={16} style={{ color: "var(--warning)", flexShrink: 0 }} />
        ) : (
          <CheckCircle2 size={16} style={{ color: "var(--c-brand)", flexShrink: 0 }} />
        )}
        <span>{outcome.message}</span>
      </div>

      {report.stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {report.stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-input)",
                backgroundColor: "var(--c-surface-sunken)",
                border: "1px solid var(--c-border-subtle)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--c-text-subtle)" }}>
                {stat.label}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color:
                    stat.tone === "good"
                      ? "var(--c-brand)"
                      : stat.tone === "bad"
                      ? "var(--danger)"
                      : stat.tone === "warn"
                      ? "var(--warning)"
                      : "var(--c-text)",
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {report.lines && report.lines.length > 0 && (
        <div
          style={{
            maxHeight: 220,
            overflow: "auto",
            padding: "10px 12px",
            borderRadius: "var(--radius-input)",
            backgroundColor: "var(--c-surface-sunken)",
            fontSize: 11.5,
            fontFamily: "var(--font-mono)",
            lineHeight: 1.65,
            color: "var(--c-text-muted)",
          }}
        >
          {report.lines.map((line, i) => (
            <div key={`${line}-${i}`}>{line}</div>
          ))}
        </div>
      )}

      {report.images && report.images.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
            marginTop: 14,
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          {report.images.map((image) => (
            <div key={image.label}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                alt={image.label}
                style={{
                  width: "100%",
                  borderRadius: "var(--radius-input)",
                  border: "1px solid var(--c-border-subtle)",
                  display: "block",
                  backgroundColor: "#ffffff",
                }}
              />
              <div style={{ fontSize: 10.5, color: "var(--c-text-subtle)", marginTop: 4, textAlign: "center" }}>
                {image.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {report.note && (
        <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--c-text-muted)", lineHeight: 1.5 }}>
          {report.note}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
        <button type="button" className="btn-primary-rounded" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "warn" | "bad";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const color = tone === "bad" ? "var(--danger)" : "var(--warning)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        borderRadius: "var(--radius-input)",
        border: `1px solid ${color}`,
        backgroundColor: tone === "bad" ? "rgba(255, 69, 58, 0.12)" : "rgba(255, 159, 10, 0.12)",
        fontSize: 12,
        color: "var(--c-text)",
        lineHeight: 1.5,
      }}
    >
      <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

const controlStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "var(--c-surface-sunken)",
  border: "1px solid var(--c-border-subtle)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  color: "var(--c-text)",
  fontSize: 12.5,
  outline: "none",
  boxShadow: "inset 0 1px 2px rgba(45, 30, 15, 0.08)",
};

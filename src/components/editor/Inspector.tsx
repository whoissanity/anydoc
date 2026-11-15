"use client";

import { useEditorStore } from "@/store/editor-store";
import { runFormScript, exportFormFdf, importFormData, readExistingFormFields } from "@/lib/edit/forms";
import { readImageFile } from "@/lib/document/validate";
import { downloadBlob } from "@/lib/document/load";
import { bytesToDataUrl, pickImageToInsert } from "@/lib/edit/insert-image";
import { formatBytes } from "@/components/workspaces/FileEditorWorkspace";
import { X } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";

export function Inspector() {
  const { t } = useI18n();
  const show = useEditorStore((s) => s.showInspector);
  const setShow = useEditorStore((s) => s.setShowInspector);
  const formFields = useEditorStore((s) => s.formFields);
  const selectedFormId = useEditorStore((s) => s.selectedFormId);
  const images = useEditorStore((s) => s.images);
  const selectedImageId = useEditorStore((s) => s.selectedImageId);
  const tool = useEditorStore((s) => s.tool);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);
  const pdfBytes = useEditorStore((s) => s.pdfBytes);
  const setPdfBytes = useEditorStore((s) => s.setPdfBytes);
  const setFormFields = useEditorStore((s) => s.setFormFields);
  const setStatus = useEditorStore((s) => s.setStatus);
  const fileName = useEditorStore((s) => s.fileName);
  const fileSize = useEditorStore((s) => s.fileSize);
  const pageCount = useEditorStore((s) => s.pageCount);
  const dirty = useEditorStore((s) => s.dirty);
  const updateFormField = useEditorStore((s) => s.updateFormField);
  const removeFormField = useEditorStore((s) => s.removeFormField);
  const updateImage = useEditorStore((s) => s.updateImage);

  if (!show) return null;

  const field = formFields.find((f) => f.id === selectedFormId);
  const image = images.find((i) => i.id === selectedImageId);

  const exportFormData = async () => {
    if (!pdfBytes) return;
    try {
      const fdf = await exportFormFdf(pdfBytes);
      const base = (fileName || "document.pdf").replace(/\.pdf$/i, "");
      downloadBlob(new Blob([fdf as unknown as BlobPart], { type: "application/vnd.fdf" }), `${base}.fdf`);
      setStatus(t("inspector.formDataExported"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("inspector.formDataFailed"));
    }
  };

  const importFormDataFile = async (file: File) => {
    if (!pdfBytes) return;
    try {
      const result = await importFormData(pdfBytes, await file.arrayBuffer());
      setPdfBytes(result.bytes);
      setFormFields(await readExistingFormFields(result.bytes));
      setStatus(t("inspector.formDataImported", { filled: result.filled, skipped: result.skipped }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("inspector.formDataFailed"));
    }
  };

  return (
    <aside
      className="editor-inspector"
      style={{
        width: "var(--inspector-w)",
        backgroundColor: "var(--c-surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        boxShadow: "var(--shadow-divider-l)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        zIndex: 25,
      }}
    >
      <div
        style={{
          height: 38,
          padding: "0 14px",
          boxShadow: "var(--shadow-divider-b)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text)" }}>
          {t("inspector.title")}
        </span>
        <button
          type="button"
          onClick={() => setShow(false)}
          title={t("inspector.close")}
          style={{
            color: "var(--c-text-muted)",
            display: "grid",
            placeItems: "center",
            padding: 4,
            borderRadius: "var(--radius-btn)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 14, fontSize: 12 }}>
        <Section title={t("inspector.document")}>
          <Row label={t("inspector.file")} value={fileName || "—"} />
          <Row label={t("inspector.pages")} value={String(pageCount || 0)} mono />
          <Row label={t("inspector.size")} value={formatBytes(fileSize)} mono />
          <Row
            label={t("inspector.status")}
            value={dirty ? t("inspector.modified") : t("inspector.saved")}
          />
          <Row label={t("inspector.activeTool")} value={tool} />
        </Section>

        <Section title={t("inspector.insert")}>
          <button
            type="button"
            disabled={!hasDoc}
            onClick={pickImageToInsert}
            style={{
              ...btnStyle,
              opacity: hasDoc ? 1 : 0.5,
              cursor: hasDoc ? "pointer" : "not-allowed",
            }}
          >
            {t("inspector.insertImage")}
          </button>
          <p
            style={{
              color: "var(--c-text-subtle)",
              lineHeight: 1.5,
              margin: "8px 0 0",
              fontSize: 11,
            }}
          >
            {t("inspector.insertImageHint")}
          </p>
        </Section>

        <Section title={t("inspector.formData")}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={!hasDoc}
              onClick={() => void exportFormData()}
              style={{
                ...btnStyle,
                flex: 1,
                opacity: hasDoc ? 1 : 0.5,
                cursor: hasDoc ? "pointer" : "not-allowed",
              }}
            >
              {t("inspector.exportFormData")}
            </button>
            <label
              style={{
                ...btnStyle,
                flex: 1,
                textAlign: "center",
                opacity: hasDoc ? 1 : 0.5,
                cursor: hasDoc ? "pointer" : "not-allowed",
              }}
            >
              {t("inspector.importFormData")}
              <input
                type="file"
                accept=".fdf,.xfdf,application/vnd.fdf,application/xml,text/xml"
                disabled={!hasDoc}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void importFormDataFile(file);
                }}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <p
            style={{
              color: "var(--c-text-subtle)",
              lineHeight: 1.5,
              margin: "8px 0 0",
              fontSize: 11,
            }}
          >
            {t("inspector.formDataHint")}
          </p>
        </Section>

        {field && (
          <Section title={t("inspector.formField")}>
            <FieldGroup title={t("inspector.identity")}>
              <label style={labelStyle}>{t("inspector.fieldName")}</label>
              <input
                style={inputStyle}
                value={field.name}
                onChange={(e) => updateFormField(field.id, { name: e.target.value })}
              />
              <label style={labelStyle}>{t("inspector.fieldType")}</label>
              <div>
                <span className="field-type-badge">{field.type}</span>
              </div>
            </FieldGroup>

            <FieldGroup title={t("inspector.value")}>
              <label style={labelStyle}>{t("inspector.value")}</label>
              <input
                style={inputStyle}
                value={field.value || ""}
                onChange={(e) => updateFormField(field.id, { value: e.target.value })}
              />
              {(field.type === "checkbox" || field.type === "radio") && (
                <label
                  style={{
                    ...labelStyle,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    cursor: "pointer",
                    marginTop: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!field.checked}
                    onChange={(e) => updateFormField(field.id, { checked: e.target.checked })}
                  />
                  {t("inspector.checked")}
                </label>
              )}
              {field.type === "dropdown" && (
                <>
                  <label style={labelStyle}>{t("inspector.options")}</label>
                  <input
                    style={inputStyle}
                    value={(field.options || []).join(", ")}
                    onChange={(e) =>
                      updateFormField(field.id, {
                        options: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </>
              )}
            </FieldGroup>

            <FieldGroup title={t("inspector.actions")}>
              <div className="script-editor-bar">
                <span>{t("inspector.calculateScript")}</span>
                <span className="script-editor-hint">{t("inspector.sandboxed")}</span>
              </div>
              <textarea
                className="script-editor"
                spellCheck={false}
                value={field.calculateScript || ""}
                placeholder={"// event.value = Number(getField('A').value) + 1"}
                onChange={(e) => updateFormField(field.id, { calculateScript: e.target.value })}
              />
              <button
                style={btnStyle}
                onClick={async () => {
                  const fields: Record<string, string | boolean | number> = {};
                  formFields.forEach((f) => {
                    fields[f.name] = f.value ?? (f.checked ? 1 : "");
                  });
                  if (field.calculateScript) {
                    // Executed behind an opaque-origin sandbox (see runFormScript).
                    const r = await runFormScript(field.calculateScript, {
                      fields,
                      eventValue: field.value || "",
                    });
                    if (r.ok && r.value != null) {
                      updateFormField(field.id, { value: String(r.value) });
                      useEditorStore
                        .getState()
                        .setStatus(t("inspector.calculateOk", { value: String(r.value) }));
                    } else {
                      useEditorStore.getState().setStatus(r.error || t("inspector.calculateFailed"));
                    }
                  }
                }}
              >
                {t("inspector.runCalculate")}
              </button>
              <button
                style={{ ...btnStyle, color: "var(--danger)" }}
                onClick={() => removeFormField(field.id)}
              >
                {t("inspector.deleteField")}
              </button>
            </FieldGroup>
          </Section>
        )}

        {image && (
          <Section title={t("inspector.imageObject")}>
            <label style={labelStyle}>{t("inspector.xPosition")}</label>
            <input
              type="number"
              style={inputStyle}
              value={image.x}
              onChange={(e) => updateImage(image.id, { x: Number(e.target.value) })}
            />
            <label style={labelStyle}>{t("inspector.yPosition")}</label>
            <input
              type="number"
              style={inputStyle}
              value={image.y}
              onChange={(e) => updateImage(image.id, { y: Number(e.target.value) })}
            />
            <label style={labelStyle}>{t("inspector.width")}</label>
            <input
              type="number"
              style={inputStyle}
              value={image.width}
              onChange={(e) => updateImage(image.id, { width: Number(e.target.value) })}
            />
            <label style={labelStyle}>{t("inspector.height")}</label>
            <input
              type="number"
              style={inputStyle}
              value={image.height}
              onChange={(e) => updateImage(image.id, { height: Number(e.target.value) })}
            />
            <label style={labelStyle}>{t("inspector.rotation")}</label>
            <input
              type="number"
              style={inputStyle}
              value={image.rotation}
              onChange={(e) => updateImage(image.id, { rotation: Number(e.target.value) })}
            />
            <button
              style={btnStyle}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    // Kind comes from the signature bytes, not `file.type`.
                    const { bytes: buf, mime } = await readImageFile(file);
                    updateImage(image.id, {
                      dataUrl: bytesToDataUrl(buf, mime),
                      replaced: true,
                    });
                    useEditorStore.getState().setStatus(t("inspector.imageReplaced"));
                  } catch (err) {
                    useEditorStore
                      .getState()
                      .setStatus(
                        err instanceof Error ? err.message : t("inspector.imageUnreadable")
                      );
                  }
                };
                input.click();
              }}
            >
              {t("inspector.replaceImage")}
            </button>
            <button
              style={{ ...btnStyle, color: "var(--danger)" }}
              onClick={() => {
                // Kept as a pending edit so save clears the region in the file, not just the overlay.
                updateImage(image.id, { removed: true });
                useEditorStore.getState().setSelectedImageId(null);
                useEditorStore.getState().setStatus(t("inspector.imageRemoved"));
              }}
            >
              {t("inspector.deleteImage")}
            </button>
          </Section>
        )}

        {!field && !image && (
          <p style={{ color: "var(--c-text-subtle)", lineHeight: 1.5, margin: 0, fontSize: 12 }}>
            {t("inspector.emptyHint")}
          </p>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--c-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="inspector-group">
      <div className="inspector-group-title">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 8,
        gap: 8,
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--c-text-muted)" }}>{label}</span>
      <span
        style={{
          textAlign: "right",
          wordBreak: "break-all",
          fontWeight: 600,
          color: "var(--c-text)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
          fontVariantNumeric: mono ? "tabular-nums" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--c-text)",
  marginBottom: 4,
  marginTop: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "var(--c-surface-sunken)",
  border: "none",
  borderRadius: "var(--radius-input)",
  padding: "6px 10px",
  color: "var(--c-text)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  outline: "none",
  boxShadow: "inset 0 1px 2px rgba(45, 30, 15, 0.08)",
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 10,
  backgroundColor: "var(--c-surface-raised)",
  boxShadow: "var(--shadow-raised-sm)",
  borderRadius: "var(--radius-btn)",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--c-text)",
  textAlign: "center",
  cursor: "pointer",
  transition: "all 120ms ease",
};

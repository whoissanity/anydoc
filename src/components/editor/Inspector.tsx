"use client";

import { useEditorStore } from "@/store/editor-store";
import { runFormScript } from "@/lib/edit/forms";
import { readImageFile } from "@/lib/document/validate";
import { bytesToDataUrl, pickImageToInsert } from "@/lib/edit/insert-image";
import { formatBytes } from "@/components/workspaces/FileEditorWorkspace";
import { X } from "lucide-react";

export function Inspector() {
  const show = useEditorStore((s) => s.showInspector);
  const setShow = useEditorStore((s) => s.setShowInspector);
  const formFields = useEditorStore((s) => s.formFields);
  const selectedFormId = useEditorStore((s) => s.selectedFormId);
  const images = useEditorStore((s) => s.images);
  const selectedImageId = useEditorStore((s) => s.selectedImageId);
  const tool = useEditorStore((s) => s.tool);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);
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

  return (
    <aside
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
          Properties
        </span>
        <button
          type="button"
          onClick={() => setShow(false)}
          title="Close properties"
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
        <Section title="Document">
          <Row label="File" value={fileName || "—"} />
          <Row label="Pages" value={String(pageCount || 0)} mono />
          <Row label="Size" value={formatBytes(fileSize)} mono />
          <Row label="Status" value={dirty ? "Modified" : "Saved"} />
          <Row label="Active Tool" value={tool} />
        </Section>

        <Section title="Insert">
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
            Insert Image (PNG / JPEG)
          </button>
          <p
            style={{
              color: "var(--c-text-subtle)",
              lineHeight: 1.5,
              margin: "8px 0 0",
              fontSize: 11,
            }}
          >
            Upload an image, drag it into place on the page, then Save to embed it.
          </p>
        </Section>

        {field && (
          <Section title="Form Field">
            <label style={labelStyle}>Field Name</label>
            <input
              style={inputStyle}
              value={field.name}
              onChange={(e) => updateFormField(field.id, { name: e.target.value })}
            />
            <label style={labelStyle}>Field Type</label>
            <div style={{ marginBottom: 8, color: "var(--c-text-muted)", fontSize: 11 }}>
              {field.type}
            </div>
            <label style={labelStyle}>Value</label>
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
                Checked
              </label>
            )}
            {field.type === "dropdown" && (
              <>
                <label style={labelStyle}>Options (comma-separated)</label>
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
            <label style={labelStyle}>Calculate Script</label>
            <textarea
              style={{
                ...inputStyle,
                minHeight: 50,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
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
                    useEditorStore.getState().setStatus(`Calculate OK → ${r.value}`);
                  } else {
                    useEditorStore.getState().setStatus(r.error || "Calculate failed");
                  }
                }
              }}
            >
              Run Calculate Script
            </button>
            <button
              style={{ ...btnStyle, color: "var(--danger)" }}
              onClick={() => removeFormField(field.id)}
            >
              Delete Field
            </button>
          </Section>
        )}

        {image && (
          <Section title="Image Object">
            <label style={labelStyle}>X position</label>
            <input
              type="number"
              style={inputStyle}
              value={image.x}
              onChange={(e) => updateImage(image.id, { x: Number(e.target.value) })}
            />
            <label style={labelStyle}>Y position</label>
            <input
              type="number"
              style={inputStyle}
              value={image.y}
              onChange={(e) => updateImage(image.id, { y: Number(e.target.value) })}
            />
            <label style={labelStyle}>Width</label>
            <input
              type="number"
              style={inputStyle}
              value={image.width}
              onChange={(e) => updateImage(image.id, { width: Number(e.target.value) })}
            />
            <label style={labelStyle}>Height</label>
            <input
              type="number"
              style={inputStyle}
              value={image.height}
              onChange={(e) => updateImage(image.id, { height: Number(e.target.value) })}
            />
            <label style={labelStyle}>Rotation</label>
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
                    useEditorStore.getState().setStatus("Image replaced — save to apply");
                  } catch (err) {
                    useEditorStore
                      .getState()
                      .setStatus(err instanceof Error ? err.message : "That image could not be read");
                  }
                };
                input.click();
              }}
            >
              Replace Image
            </button>
            <button
              style={{ ...btnStyle, color: "var(--danger)" }}
              onClick={() => {
                // Kept as a pending edit so save clears the region in the file, not just the overlay.
                updateImage(image.id, { removed: true });
                useEditorStore.getState().setSelectedImageId(null);
                useEditorStore.getState().setStatus("Image marked for removal — save to apply");
              }}
            >
              Delete Image
            </button>
          </Section>
        )}

        {!field && !image && (
          <p style={{ color: "var(--c-text-subtle)", lineHeight: 1.5, margin: 0, fontSize: 12 }}>
            Select a form field, image object, or edit text on the document canvas.
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

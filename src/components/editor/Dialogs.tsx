"use client";

import { useState } from "react";
import { useEditorStore } from "@/store/editor-store";
import { readPdfFile } from "@/lib/document/validate";
import { EXPORT_SECTIONS, formatMeta } from "@/lib/export/catalog";
import { FormatIcon } from "@/components/shared/FormatIcon";
import { ExportScopeBar } from "./ExportScopeBar";
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

  return (
    <Modal title="Bates Numbering Stamp" onClose={onClose}>
      <label style={lab}>Prefix</label>
      <input
        style={inp}
        value={local.prefix}
        onChange={(e) => setLocal({ ...local, prefix: e.target.value })}
      />
      <label style={lab}>Start Number</label>
      <input
        style={inp}
        type="number"
        value={local.start}
        onChange={(e) => setLocal({ ...local, start: Number(e.target.value) })}
      />
      <label style={lab}>Digits Padding (e.g. 6 digits: 000001)</label>
      <input
        style={inp}
        type="number"
        value={local.padding}
        onChange={(e) => setLocal({ ...local, padding: Number(e.target.value) })}
      />
      <label style={lab}>Suffix</label>
      <input
        style={inp}
        value={local.suffix}
        onChange={(e) => setLocal({ ...local, suffix: e.target.value })}
      />
      <label style={lab}>Stamp Position</label>
      <select
        style={inp}
        value={local.position}
        onChange={(e) =>
          setLocal({ ...local, position: e.target.value as BatesOptions["position"] })
        }
      >
        <option value="top-left">Top left</option>
        <option value="top-right">Top right</option>
        <option value="bottom-left">Bottom left</option>
        <option value="bottom-right">Bottom right</option>
      </select>
      <label style={lab}>Font Size</label>
      <input
        style={inp}
        type="number"
        value={local.fontSize}
        onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          Cancel
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
          Apply Bates Stamp
        </button>
      </div>
    </Modal>
  );
}

export function ConvertDialog({
  onClose,
  onExport,
  onCreate,
}: {
  onClose: () => void;
  onExport: (format: string) => void;
  onCreate: (kind: string) => void;
}) {
  return (
    <Modal title="Convert & Export Document" onClose={onClose} wide>
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
                Export as PDF (.pdf)
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
                Recommended
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--c-text-muted)", marginTop: 2 }}>
              Save all changes, form fields, page organizing, and annotations into a clean PDF
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
          Download PDF
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
          Export to Other Formats
          <span style={{ marginLeft: 8, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
            — converted in your browser
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
          Create New Document
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            ["images", "From Images"],
            ["text", "From Plain Text"],
            ["html", "From HTML"],
            ["documents", "From any document"],
            ["docx", "From Word (.docx)"],
            ["xlsx", "From Excel (.xlsx)"],
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
  const [text, setText] = useState("AnyDoc\n\nStart typing your document text here…");
  return (
    <Modal title="Create PDF from text" onClose={onClose}>
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
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          onClick={() => onCreate(text)}
        >
          Create PDF
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
    <Modal title="Permanent Redaction & Sanitization" onClose={onClose}>
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
          <strong>Irreversible Redaction:</strong> Selected areas are permanently blacked out in the vector stream. Underlying text strings and coordinates cannot be highlighted, recovered, or extracted.
        </span>
      </div>

      <label style={lab}>Target Page</label>
      <input
        type="number"
        min={1}
        max={pageCount || 1}
        value={page}
        onChange={(e) => setPage(Math.max(1, Math.min(pageCount, Number(e.target.value))))}
        style={inp}
      />

      <label style={lab}>Redaction Region Preset</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 4 }}>
        {[
          ["header", "Header Block"],
          ["footer", "Footer Strip"],
          ["ssn", "SSN / ID Box"],
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
          <label style={lab}>X Offset (pts)</label>
          <input type="number" value={x} onChange={(e) => setX(Number(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lab}>Y Offset (pts)</label>
          <input type="number" value={y} onChange={(e) => setY(Number(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lab}>Width (pts)</label>
          <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lab}>Height (pts)</label>
          <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} style={inp} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          style={{ backgroundColor: "var(--danger)", color: "#ffffff" }}
          onClick={() => {
            onApply({ pageIndex: page - 1, x, y, width, height });
          }}
        >
          Apply Permanent Redaction
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
  const [signerName, setSignerName] = useState("Corporate Officer");
  const [organization, setOrganization] = useState("Legal & Compliance Dept");
  const [reason, setReason] = useState("Official Document Approval & Release");
  const [location, setLocation] = useState("London, UK");

  return (
    <Modal title="Document Integrity Stamp" onClose={onClose}>
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
          Stamp an SHA-256 fingerprint of this document with signer details. No certificate or private
          key is used, so this is an unsigned integrity stamp — not a digital signature.
        </span>
      </div>

      <label style={lab}>Signer Name</label>
      <input style={inp} value={signerName} onChange={(e) => setSignerName(e.target.value)} />

      <label style={lab}>Organization / Entity</label>
      <input style={inp} value={organization} onChange={(e) => setOrganization(e.target.value)} />

      <label style={lab}>Reason for Signing</label>
      <input style={inp} value={reason} onChange={(e) => setReason(e.target.value)} />

      <label style={lab}>Location</label>
      <input style={inp} value={location} onChange={(e) => setLocation(e.target.value)} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
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
          Apply Integrity Stamp
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
  return (
    <Modal title="Metadata Scrubbing & Privacy Sanitizer" onClose={onClose}>
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
          Strip identifying metadata from <strong>{fileName || "this document"}</strong> to protect user privacy and confidentiality before public distribution.
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--c-text-muted)", marginBottom: 12 }}>
        The following hidden data fields will be irreversibly erased:
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          "Document Title & Subtitle",
          "Author Name & Organization ID",
          "Subject & Keywords tags",
          "Creator Tool & Software Version",
          "PDF Producer application signature",
          "Creation Date & Last Modified Timestamp",
          "Embedded edit history and print presets",
        ].map((item) => (
          <li key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--c-text)" }}>
            <CheckCircle2 size={14} style={{ color: "var(--c-brand)" }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          onClick={onApply}
        >
          Scrub & Clean Document
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

  return (
    <Modal title="Password Protection & Granular Permissions" onClose={onClose}>
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
          <strong>Not available in the browser build.</strong> PDF encryption has to be written by a
          signing engine, which this client-only editor does not bundle. Nothing is encrypted here —
          use Sanitize to remove hidden data, or run the desktop engine to set a password.
        </span>
      </div>

      <label style={lab}>Open Document Password (User Password)</label>
      <input
        type="password"
        placeholder="Required to view the document…"
        value={userPass}
        onChange={(e) => setUserPass(e.target.value)}
        style={inp}
      />

      <label style={lab}>Master / Permissions Password (Owner Password)</label>
      <input
        type="password"
        placeholder="Required to change security permissions…"
        value={ownerPass}
        onChange={(e) => setOwnerPass(e.target.value)}
        style={inp}
      />

      <label style={lab}>Granular Security Permissions</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--c-text)", cursor: "pointer" }}>
          <input type="checkbox" checked={allowPrint} onChange={(e) => setAllowPrint(e.target.checked)} />
          <span>Allow Printing document</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--c-text)", cursor: "pointer" }}>
          <input type="checkbox" checked={allowCopy} onChange={(e) => setAllowCopy(e.target.checked)} />
          <span>Allow Copying text and graphics</span>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary-rounded"
          disabled
          title="Requires the desktop engine"
          onClick={() => onApply({ userPass, ownerPass, allowPrint, allowCopy })}
          style={{ opacity: 0.5, cursor: "not-allowed" }}
        >
          Encryption unavailable
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

  return (
    <Modal title="Document Comparison ('Diff' Tool)" onClose={onClose} wide>
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
          Compare two versions of a document side-by-side to detect additions, deletions, page movements, and alterations.
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
            Base Version (Active)
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", marginTop: 4 }}>
            {fileName || "Current Document.pdf"}
          </div>
          <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 2 }}>
            {pageCount} page(s)
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
            Comparison Version
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
                      .setStatus(err instanceof Error ? err.message : "That file is not a valid PDF");
                  }
                }}
              />
              <button
                type="button"
                className="btn-secondary-rounded"
                style={{ marginTop: 8 }}
                onClick={() => document.getElementById("diff-file-picker")?.click()}
              >
                Select Comparison PDF
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!secondaryFile}
          className="btn-primary-rounded"
          onClick={() => {
            if (secondaryFile) onCompareFile(secondaryFile);
          }}
        >
          Run Document Comparison
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

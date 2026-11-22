"use client";

import { useEditorStore } from "@/store/editor-store";
import { ToolGallery } from "@/components/tools/ToolGallery";
import { EXPORT_FORMATS } from "@/lib/export/catalog";
import { FormatIcon } from "@/components/shared/FormatIcon";
import { ExportScopeBar } from "@/components/editor/ExportScopeBar";
import {
  FileText,
  FileOutput,
  Image as ImageIcon,
  ScanText,
  Stamp,
  FormInput,
  FileCode,
  FileSpreadsheet,
  Sparkles,
  Download,
  ShieldAlert,
  EyeOff,
  FileCheck,
  Lock,
  GitCompare,
  MessageSquare,
  Users,
} from "lucide-react";

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function FileEditorWorkspace({
  onExport,
  onCreate,
  onOcr,
  onAutoDetect,
}: {
  onExport?: (format: string) => void;
  onCreate?: (kind: string) => void;
  onOcr?: () => void;
  onAutoDetect?: () => void;
}) {
  const fileName = useEditorStore((s) => s.fileName);
  const fileSize = useEditorStore((s) => s.fileSize);
  const pageCount = useEditorStore((s) => s.pageCount);
  const dirty = useEditorStore((s) => s.dirty);
  const setActiveDialog = useEditorStore((s) => s.setActiveDialog);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "var(--c-bg)",
        overflowY: "auto",
        padding: "36px 24px",
      }}
    >
      <div
        style={{
          maxWidth: "var(--page-width-regular)",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {hasDoc && (
          <div
            className="card-raised"
            style={{
              backgroundColor: "var(--c-surface-raised)",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--shadow-raised)",
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "var(--radius-soft)",
                  backgroundColor: "var(--c-surface-elevated)",
                  color: "var(--c-text)",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "var(--shadow-raised-sm)",
                }}
              >
                <FileText size={22} strokeWidth={1.5} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--c-text)" }}>
                  {fileName || "Untitled Document.pdf"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--c-text-muted)",
                    display: "flex",
                    gap: 12,
                    marginTop: 3,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)" }}>{pageCount} pages</span>
                  <span>•</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {formatBytes(fileSize)}
                  </span>
                  <span>•</span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: dirty ? "var(--warning)" : "var(--success)",
                    }}
                  >
                    {dirty ? "Modified" : "Saved"}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary-rounded"
              onClick={() => setActiveDialog("convert")}
            >
              <FileOutput size={16} strokeWidth={1.5} />
              <span>Convert Document</span>
            </button>
          </div>
        )}

        <ToolGallery />

        <section
          style={{
            padding: "24px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-bg-varied-1)",
            boxShadow: "var(--shadow-raised-sm)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--c-text)",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FileOutput size={18} strokeWidth={1.85} />
            <span>Convert & Export</span>
          </div>

          <ExportScopeBar />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: 16,
            }}
          >
            <ToolTile
              title="Export as PDF (.pdf)"
              description="Save & download your finalized PDF with all edits, forms, and pages baked in."
              icon={<Download size={20} strokeWidth={2} style={{ color: "var(--c-btn-bg)" }} />}
              disabled={!hasDoc}
              highlight
              onClick={() => onExport?.("pdf")}
            />
            {EXPORT_FORMATS.map((format) => (
              <ToolTile
                key={format.id}
                title={`${format.label} (.${format.extension})`}
                description={format.description}
                icon={<FormatIcon id={format.id} size={20} />}
                disabled={!hasDoc}
                onClick={() => onExport?.(format.id)}
              />
            ))}
          </div>
        </section>

        <section
          style={{
            padding: "24px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-raised)",
            boxShadow: "var(--shadow-raised)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--c-text)",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ShieldAlert size={18} strokeWidth={1.85} style={{ color: "var(--danger)" }} />
            <span>Security, Redaction & Compliance</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            <ToolTile
              title="Permanent Redaction"
              description="Irreversibly black out sensitive text, SSNs, and areas so data cannot be recovered."
              icon={<EyeOff size={20} strokeWidth={1.85} style={{ color: "var(--danger)" }} />}
              disabled={!hasDoc}
              onClick={() => setActiveDialog("redact")}
            />
            <ToolTile
              title="Metadata Scrubbing (Sanitize)"
              description="Strip author, creator, history, keywords, and hidden identifying information."
              icon={<ShieldAlert size={20} strokeWidth={1.85} style={{ color: "var(--c-brand)" }} />}
              disabled={!hasDoc}
              onClick={() => setActiveDialog("metadata")}
            />
            <ToolTile
              title="Digital Signatures & Certificates"
              description="Cryptographically sign document using digital IDs, reason, and SHA-256 seal stamp."
              icon={<FileCheck size={20} strokeWidth={1.85} style={{ color: "var(--c-primary)" }} />}
              disabled={!hasDoc}
              onClick={() => setActiveDialog("signature")}
            />
            <ToolTile
              title="Password Protection & Permissions"
              description="Preview the security options and see why encryption needs the desktop engine."
              icon={<Lock size={20} strokeWidth={1.85} style={{ color: "var(--warning)" }} />}
              disabled={!hasDoc}
              onClick={() => setActiveDialog("password")}
            />
          </div>
        </section>

        <section
          style={{
            padding: "24px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-raised)",
            boxShadow: "var(--shadow-raised)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--c-text)",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Users size={18} strokeWidth={1.85} style={{ color: "var(--c-accent-blue)" }} />
            <span>Collaboration, Annotations & Review</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            <ToolTile
              title="Document Comparison ('Diff')"
              description="Visually compare two versions of a PDF and see exactly which pages changed, in red."
              icon={<GitCompare size={20} strokeWidth={1.85} style={{ color: "var(--c-accent-blue)" }} />}
              disabled={!hasDoc}
              onClick={() => {
                setActiveTool("compare");
                setActiveDialog("tool");
              }}
            />
            <ToolTile
              title="Comment Management Sidebar"
              description="Review threads, status tracking (Accepted, Rejected, Cancelled), and author notes."
              icon={<MessageSquare size={20} strokeWidth={1.85} style={{ color: "var(--c-brand)" }} />}
              disabled={!hasDoc}
              onClick={() => {
                useEditorStore.getState().setLeftPane("comments");
                useEditorStore.getState().setCurrentView("viewer");
              }}
            />
            <ToolTile
              title="Export Annotations (XFDF)"
              description="Export document comments, review status, and markup data to XML/FDF format."
              icon={<FileOutput size={20} strokeWidth={1.85} />}
              disabled={!hasDoc}
              onClick={() => onExport?.("xfdf")}
            />
          </div>
        </section>

        <section
          style={{
            padding: "24px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-surface-raised)",
            boxShadow: "var(--shadow-raised)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--c-text)",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Sparkles size={18} strokeWidth={1.85} />
            <span>Document Processing Engines</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            <ToolTile
              title="OCR Searchability Engine"
              description="Extract text from scanned PDF pages using Tesseract OCR to make it searchable and selectable."
              icon={<ScanText size={20} strokeWidth={1.85} />}
              disabled={!hasDoc}
              onClick={() => onOcr?.()}
            />
            <ToolTile
              title="Bates Numbering Stamp"
              description="Apply standardized legal/medical sequential bates numbering stamps with custom prefix, padding, and corner positioning."
              icon={<Stamp size={20} strokeWidth={1.85} />}
              disabled={!hasDoc}
              onClick={() => setActiveDialog("bates")}
            />
            <ToolTile
              title="Auto-Detect Form Fields"
              description="Computer vision heuristics to discover input boxes, underline blanks, and checkboxes automatically."
              icon={<FormInput size={20} strokeWidth={1.85} />}
              disabled={!hasDoc}
              onClick={() => onAutoDetect?.()}
            />
          </div>
        </section>

        <section
          style={{
            padding: "24px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-bg-varied-1)",
            boxShadow: "var(--shadow-raised-sm)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--c-text)",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FileText size={18} strokeWidth={1.5} />
            <span>Create New Document</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: 16,
            }}
          >
            <ToolTile
              title="From Plain Text"
              description="Type or paste markdown/text to generate a PDF"
              icon={<FileText size={20} strokeWidth={1.5} />}
              onClick={() => onCreate?.("text")}
            />
            <ToolTile
              title="From Images"
              description="Compile multiple PNG or JPEG images into a PDF"
              icon={<ImageIcon size={20} strokeWidth={1.5} />}
              onClick={() => onCreate?.("images")}
            />
            <ToolTile
              title="From HTML"
              description="Convert an HTML file or snippet into a PDF"
              icon={<FileCode size={20} strokeWidth={1.5} />}
              onClick={() => onCreate?.("html")}
            />
            <ToolTile
              title="From Office (.docx / .xlsx)"
              description="Convert Word or Excel documents directly to PDF"
              icon={<FileSpreadsheet size={20} strokeWidth={1.5} />}
              onClick={() => onCreate?.("docx")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ToolTile({
  title,
  description,
  icon,
  disabled,
  highlight,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="card-raised"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "18px 20px",
        borderRadius: "var(--radius-card)",
        backgroundColor: highlight ? "var(--c-surface-elevated)" : "var(--c-surface-raised)",
        border: highlight ? "1.5px solid var(--c-primary)" : "1px solid var(--c-border-subtle)",
        boxShadow: highlight ? "var(--shadow-raised)" : "var(--shadow-raised-sm)",
        textAlign: "left",
        gap: 10,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform 140ms ease, box-shadow 140ms ease",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "var(--shadow-raised-lg)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "var(--shadow-raised)";
        }
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "var(--radius-soft)",
          backgroundColor: "var(--c-surface-elevated)",
          color: "var(--c-text)",
          display: "grid",
          placeItems: "center",
          boxShadow: "var(--shadow-raised-sm)",
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text)" }}>{title}</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--c-text-muted)",
            lineHeight: 1.45,
            marginTop: 4,
          }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}

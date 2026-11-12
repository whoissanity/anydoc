"use client";

import { Upload, FileText, Image as ImageIcon, FileCode, CheckCircle2 } from "lucide-react";

export default function LandingWorkspace({
  onOpenFile,
  onCreate,
}: {
  onOpenFile: () => void;
  onCreate: (kind: string) => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        backgroundColor: "var(--c-bg)",
        overflowY: "auto",
        padding: "48px 24px",
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
          maxWidth: "var(--page-width-regular)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: 780,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 14px",
              borderRadius: "var(--radius-btn)",
              backgroundColor: "var(--c-surface-raised)",
              boxShadow: "var(--shadow-raised-sm)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--c-text-muted)",
              letterSpacing: "0.02em",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "var(--c-brand)",
              }}
            />
            AnyDoc · 100% Private Document Studio
          </div>

          <h1
            className="display-headline"
            style={{
              margin: 0,
            }}
          >
            The most private document editor on the internet.
          </h1>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--c-text-muted)",
              margin: 0,
              maxWidth: 540,
            }}
          >
            Every PDF, form, redaction and conversion runs 100% inside your browser.
            No uploads, no accounts, no tracking — your documents never leave your device.
          </p>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 880,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 28,
            alignItems: "stretch",
          }}
        >
          <div
            onClick={onOpenFile}
            className="card-raised"
            style={{
              padding: "40px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              cursor: "pointer",
              borderRadius: "var(--radius-card)",
              backgroundColor: "var(--c-surface-raised)",
              boxShadow: "var(--shadow-raised)",
              border: "1.5px dashed var(--c-border-strong)",
              position: "relative",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "var(--radius-soft)",
                backgroundColor: "var(--c-surface-elevated)",
                color: "var(--c-text)",
                display: "grid",
                placeItems: "center",
                marginBottom: 20,
                boxShadow: "var(--shadow-raised-sm)",
              }}
            >
              <Upload size={28} strokeWidth={1.5} />
            </div>

            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--c-text)",
                margin: "0 0 8px 0",
                letterSpacing: "-0.01em",
              }}
            >
              Drop any document here
            </h2>

            <p
              style={{
                fontSize: 13,
                color: "var(--c-text-muted)",
                margin: "0 0 24px 0",
                maxWidth: 280,
                lineHeight: 1.45,
              }}
            >
              Click to browse your device or drag and drop any file directly onto this workbench.
            </p>

            <button
              type="button"
              className="btn-primary-rounded"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile();
              }}
            >
              <Upload size={16} strokeWidth={1.5} />
              <span>Select Document</span>
            </button>
          </div>

          <div
            className="card-raised"
            onClick={onOpenFile}
            style={{
              padding: "24px",
              borderRadius: "var(--radius-card)",
              backgroundColor: "var(--c-surface-elevated)",
              backgroundImage:
                "radial-gradient(ellipse at 50% 20%, rgba(255, 255, 255, 0.07) 0%, transparent 75%)",
              border: "1px solid var(--c-border)",
              boxShadow: "var(--shadow-raised)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: "var(--c-accent-green)",
                    boxShadow: "0 0 8px var(--c-accent-green)",
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--c-text)",
                  }}
                >
                  Staged Document Preview
                </span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  color: "var(--c-text-subtle)",
                  backgroundColor: "var(--c-hover)",
                  padding: "2px 7px",
                  borderRadius: "var(--radius-btn)",
                  border: "1px solid var(--c-border-subtle)",
                }}
              >
                PDF-2.0 Interactive
              </span>
            </div>

            <div
              style={{
                position: "relative",
                margin: "24px auto",
                width: "86%",
                maxWidth: 320,
                aspectRatio: "1 / 1.34",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "#e2e8f0",
                  borderRadius: 6,
                  transform: "rotate(4deg) translate(8px, 6px)",
                  opacity: 0.6,
                  boxShadow: "var(--shadow-staged-card)",
                  border: "1px solid rgba(0, 0, 0, 0.08)",
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "#f1f5f9",
                  borderRadius: 6,
                  transform: "rotate(-2.5deg) translate(-4px, 3px)",
                  opacity: 0.85,
                  boxShadow: "var(--shadow-staged-card)",
                  border: "1px solid rgba(0, 0, 0, 0.08)",
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  backgroundColor: "#ffffff",
                  borderRadius: 6,
                  boxShadow: "var(--shadow-staged-doc)",
                  border: "1px solid rgba(0, 0, 0, 0.08)",
                  padding: "16px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  transform: "rotate(-0.8deg)",
                  transition: "transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "rotate(0deg) translateY(-4px) scale(1.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "rotate(-0.8deg)";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingBottom: 6,
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        backgroundColor: "#ef4444",
                        color: "#ffffff",
                        fontSize: 8,
                        fontWeight: 800,
                        padding: "1px 4px",
                        borderRadius: 2,
                        letterSpacing: "0.05em",
                      }}
                    >
                      PDF
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#0f172a",
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      STRATEGY_BRIEF_2026.pdf
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "#16a34a",
                      backgroundColor: "#dcfce7",
                      padding: "1px 5px",
                      borderRadius: 999,
                    }}
                  >
                    ✓ Ready
                  </span>
                </div>

                <div style={{ width: "52%", height: 7, backgroundColor: "#0f172a", borderRadius: 2, marginTop: 4 }} />

                <div style={{ width: "100%", height: 3.5, backgroundColor: "#475569", borderRadius: 2 }} />
                <div style={{ width: "94%", height: 3.5, backgroundColor: "#64748b", borderRadius: 2 }} />
                <div style={{ width: "78%", height: 3.5, backgroundColor: "#94a3b8", borderRadius: 2 }} />

                <div
                  style={{
                    marginTop: 4,
                    padding: "6px 8px",
                    borderRadius: 4,
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: "#334155" }}>
                      Executive Summary
                    </span>
                    <div style={{ width: "65%", height: 3, backgroundColor: "#94a3b8", borderRadius: 1.5 }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 16 }}>
                    <div style={{ width: 4, height: 8, backgroundColor: "#0A84FF", borderRadius: 1 }} />
                    <div style={{ width: 4, height: 12, backgroundColor: "#30D158", borderRadius: 1 }} />
                    <div style={{ width: 4, height: 16, backgroundColor: "#FF9F0A", borderRadius: 1 }} />
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 2,
                    padding: "5px 8px",
                    borderRadius: 4,
                    backgroundColor: "#ffffff",
                    border: "1.5px dashed #0A84FF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: "#0A84FF",
                        display: "grid",
                        placeItems: "center",
                        color: "#ffffff",
                        fontSize: 8,
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      ✓
                    </div>
                    <span style={{ fontSize: 8, fontWeight: 600, color: "#1e293b" }}>
                      Interactive Form Signature
                    </span>
                  </div>
                  <span style={{ fontSize: 7, color: "#64748b", fontFamily: "var(--font-mono)" }}>
                    PAGE 1 / 4
                  </span>
                </div>

                <div style={{ width: "100%", height: 3.5, backgroundColor: "#64748b", borderRadius: 2, marginTop: 4 }} />
                <div style={{ width: "88%", height: 3.5, backgroundColor: "#94a3b8", borderRadius: 2 }} />
                <div style={{ width: "95%", height: 3.5, backgroundColor: "#cbd5e1", borderRadius: 2 }} />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 11,
                color: "var(--c-text)",
                fontWeight: 600,
                borderTop: "1px solid var(--c-border-subtle)",
                paddingTop: 12,
                marginTop: 4,
                zIndex: 2,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={13} style={{ color: "var(--c-brand)" }} />
                Text editing
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={13} style={{ color: "var(--c-brand)" }} />
                Page organize
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={13} style={{ color: "var(--c-brand)" }} />
                OCR & forms
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 880,
            padding: "20px 24px",
            borderRadius: "var(--radius-card)",
            backgroundColor: "var(--c-bg-varied-1)",
            boxShadow: "var(--shadow-raised-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text)" }}>
              Create fresh:
            </span>
            <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
              Generate a document without an existing PDF
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-secondary-rounded"
              onClick={() => onCreate("text")}
            >
              <FileText size={14} strokeWidth={1.5} />
              <span>From text</span>
            </button>

            <button
              type="button"
              className="btn-secondary-rounded"
              onClick={() => onCreate("images")}
            >
              <ImageIcon size={14} strokeWidth={1.5} />
              <span>From images</span>
            </button>

            <button
              type="button"
              className="btn-secondary-rounded"
              onClick={() => onCreate("html")}
            >
              <FileCode size={14} strokeWidth={1.5} />
              <span>From HTML</span>
            </button>

            <button
              type="button"
              className="btn-secondary-rounded"
              onClick={() => onCreate("documents")}
            >
              <FileText size={14} strokeWidth={1.5} />
              <span>From any document</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

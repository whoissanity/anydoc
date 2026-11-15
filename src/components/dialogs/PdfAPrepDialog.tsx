"use client";

import { useState } from "react";
import { saveAs } from "file-saver";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Modal } from "@/components/editor/Dialogs";
import type { PdfAPrepResult } from "@/lib/pdf/pdf-a";
import type { PdfAVerification } from "@/lib/pdf/pdf-a-verify";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function downloadBlob(blob: Blob, fileName: string): void {
  saveAs(blob, fileName);
}

export function PdfAPrepDialog({
  bytes,
  fileName,
  onClose,
}: {
  bytes: Uint8Array | null;
  fileName: string;
  onClose: () => void;
}) {
  const [stripJavaScript, setStripJavaScript] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PdfAPrepResult | null>(null);
  const [verification, setVerification] = useState<PdfAVerification | null>(null);
  const downloadName = `${(fileName || "document").replace(/\.pdf$/i, "") || "document"}-archival.pdf`;

  const prepare = async () => {
    if (!bytes || busy) return;
    setBusy(true);
    setError(null);
    setPrepared(null);
    setVerification(null);
    try {
      const { preparePdfA } = await import("@/lib/pdf/pdf-a");
      setPrepared(await preparePdfA(bytes, { stripJavaScript }));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!prepared || verifyBusy) return;
    setVerifyBusy(true);
    setError(null);
    try {
      const { verifyPdfA } = await import("@/lib/pdf/pdf-a-verify");
      setVerification(await verifyPdfA(prepared.bytes));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setVerifyBusy(false);
    }
  };

  const savePdf = () => {
    if (!prepared) return;
    // slice() copies, so the blob never shares a buffer that Zustand may detach.
    const copy = prepared.bytes.slice();
    const blob = new Blob([copy.buffer as ArrayBuffer], { type: "application/pdf" });
    downloadBlob(blob, downloadName);
  };

  const saveReport = (format: "text" | "json") => {
    if (!verification) return;
    const body = format === "json" ? verification.json : verification.text;
    const blob = new Blob([body], {
      type: format === "json" ? "application/json" : "text/plain",
    });
    downloadBlob(blob, `document-archival-report.${format === "json" ? "json" : "txt"}`);
  };

  return (
    <Modal title="PDF/A archival preparation" onClose={onClose} width={760}>
      <p style={introStyle}>
        Build a PDF/A-2b candidate entirely on this device. This prepares structure and metadata;
        it is not an ISO certification. Verification is a local structural check, not a
        replacement for a certified validator.
      </p>

      <div style={warningStyle}>
        <AlertTriangle size={15} />
        <span>
          PDF/A preparation can change how forms and scripts behave. Keep a copy of the original
          file.
        </span>
      </div>

      <label style={toggleStyle} htmlFor="pdfa-strip-js">
        <input
          id="pdfa-strip-js"
          type="checkbox"
          checked={stripJavaScript}
          disabled={busy}
          onChange={(event) => {
            setStripJavaScript(event.target.checked);
            setPrepared(null);
            setVerification(null);
          }}
        />
        <span>
          <strong>Strip embedded JavaScript &amp; interactive scripts</strong>
          <span style={toggleHintStyle}>
            Required for strict ISO PDF/A compliance, but may break auto-calculating forms.
          </span>
        </span>
      </label>

      <div style={buttonRowStyle}>
        <button
          type="button"
          className="btn-primary-rounded"
          onClick={() => void prepare()}
          disabled={busy || !bytes}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <FileCheck2 size={14} />}
          {prepared ? "Prepare again" : "Prepare archival PDF"}
        </button>
        {prepared && (
          <button type="button" className="btn-secondary-rounded" onClick={savePdf}>
            <Download size={14} />
            Download {downloadName}
          </button>
        )}
      </div>

      {!bytes && (
        <div style={{ ...errorStyle, marginTop: 12 }}>
          <AlertTriangle size={14} />
          <span>Open a PDF before preparing an archival copy.</span>
        </div>
      )}

      {error && (
        <div style={{ ...errorStyle, marginTop: 12 }}>
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {prepared && (
        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <CheckCircle2 size={15} />
            <span>Preparation checklist</span>
          </div>
          <ul style={listStyle}>
            {prepared.checklist.map((item) => (
              <li key={item} style={listItemStyle}>
                <CheckCircle2 size={13} />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {prepared.warnings.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...sectionTitleStyle, color: "var(--warning)" }}>
                <AlertTriangle size={15} />
                <span>Warnings</span>
              </div>
              <ul style={listStyle}>
                {prepared.warnings.map((item) => (
                  <li key={item} style={{ ...listItemStyle, color: "var(--warning)" }}>
                    <AlertTriangle size={13} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={fontStatsStyle}>
            <span>{prepared.fontAudit.embedded} fonts embedded</span>
            <span>{prepared.fontAudit.missing} missing</span>
            <span>{prepared.fontAudit.invalid} invalid</span>
            <span>{prepared.fontAudit.checked} audited</span>
          </div>

          <div style={{ ...buttonRowStyle, marginTop: 14 }}>
            <button
              type="button"
              className="btn-secondary-rounded"
              onClick={() => void verify()}
              disabled={verifyBusy}
            >
              {verifyBusy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
              Run Full Compliance Verification
            </button>
            {verification && (
              <>
                <button
                  type="button"
                  className="btn-secondary-rounded"
                  onClick={() => saveReport("text")}
                >
                  <Download size={14} />
                  Report (.txt)
                </button>
                <button
                  type="button"
                  className="btn-secondary-rounded"
                  onClick={() => saveReport("json")}
                >
                  <Download size={14} />
                  Report (.json)
                </button>
              </>
            )}
          </div>

          {verification && (
            <div style={verificationStyle}>
              <div style={sectionTitleStyle}>
                <ShieldCheck size={15} />
                <span>
                  Structural verification: {verification.score}/100 ·{" "}
                  {verification.ok ? "pass" : "issues found"}
                </span>
              </div>
              <ul style={listStyle}>
                {verification.checks.map((check) => (
                  <li
                    key={check.id}
                    style={{
                      ...listItemStyle,
                      color:
                        check.status === "fail"
                          ? "var(--danger)"
                          : check.status === "warn"
                            ? "var(--warning)"
                            : "var(--c-text)",
                    }}
                  >
                    {check.status === "pass" ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <AlertTriangle size={13} />
                    )}
                    <span>
                      <strong>{check.title}</strong> — {check.detail}
                    </span>
                  </li>
                ))}
              </ul>
              <div style={noteStyle}>
                Verification is a structural audit of {fileName}. It does not replace a certified
                PDF/A validator such as veraPDF.
              </div>
            </div>
          )}
        </section>
      )}

      <div style={{ ...buttonRowStyle, justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" className="btn-secondary-rounded" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

const introStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12.5,
  lineHeight: 1.55,
  color: "var(--c-text-muted)",
};

const warningStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  padding: "9px 11px",
  borderRadius: "var(--radius-input)",
  border: "1px solid var(--warning)",
  backgroundColor: "var(--c-surface-sunken)",
  color: "var(--warning)",
  fontSize: 11.5,
  lineHeight: 1.45,
  marginBottom: 14,
};

const toggleStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  padding: "11px 12px",
  borderRadius: "var(--radius-input)",
  border: "1px solid var(--c-border-subtle)",
  backgroundColor: "var(--c-surface-sunken)",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--c-text)",
  cursor: "pointer",
};

const toggleHintStyle: React.CSSProperties = {
  display: "block",
  marginTop: 3,
  fontSize: 10.5,
  color: "var(--c-text-muted)",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginTop: 14,
};

const errorStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  padding: "9px 11px",
  borderRadius: "var(--radius-input)",
  border: "1px solid var(--danger)",
  backgroundColor: "var(--c-surface-sunken)",
  color: "var(--danger)",
  fontSize: 11.5,
  lineHeight: 1.45,
};

const sectionStyle: React.CSSProperties = {
  marginTop: 18,
  paddingTop: 14,
  borderTop: "1px solid var(--c-border-subtle)",
};

const sectionTitleStyle: React.CSSProperties = {
  display: "flex",
  gap: 7,
  alignItems: "center",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--c-text)",
  marginBottom: 8,
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: 6,
};

const listItemStyle: React.CSSProperties = {
  display: "flex",
  gap: 7,
  alignItems: "flex-start",
  fontSize: 11.5,
  lineHeight: 1.45,
  color: "var(--c-text-muted)",
};

const fontStatsStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 12,
  fontSize: 10.5,
  color: "var(--c-text-subtle)",
};

const verificationStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: "var(--radius-input)",
  border: "1px solid var(--c-border-subtle)",
  backgroundColor: "var(--c-surface-sunken)",
};

const noteStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 10.5,
  lineHeight: 1.45,
  color: "var(--c-text-subtle)",
};
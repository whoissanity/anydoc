"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ScanText,
  X,
} from "lucide-react";
import { Modal } from "@/components/editor/Dialogs";
import {
  formatOcrProgress,
  type OcrProgressUpdate,
} from "@/lib/pdf/ocr-protocol";

export interface OcrProgressModalProps {
  open: boolean;
  progress: OcrProgressUpdate | null;
  error: string | null;
  busy?: boolean;
  onStart?: () => void;
  onCancel?: () => void;
  onClose: () => void;
}

export function OcrProgressModal({
  open,
  progress,
  error,
  busy = false,
  onStart,
  onCancel,
  onClose,
}: OcrProgressModalProps) {
  if (!open) return null;

  const total = Math.max(0, progress?.total ?? 0);
  const page = Math.max(0, progress?.page ?? 0);
  const percent = total > 0 ? Math.min(100, Math.round((page / total) * 100)) : 0;
  const complete = !busy && !!progress && total > 0 && page >= total && !error;

  return (
    <Modal title="On-device OCR" onClose={onClose} width={560}>
      <div style={headerStyle}>
        <div style={iconWrapStyle}>
          <ScanText size={20} strokeWidth={1.7} />
        </div>
        <div>
          <div style={titleStyle}>Make scanned pages searchable</div>
          <p style={introStyle}>
            Pages are rendered at 150 DPI and read locally with PaddleOCR. Tesseract is used
            when Paddle cannot initialize or returns no confident text. Nothing is uploaded.
          </p>
        </div>
      </div>

      {error && (
        <div style={errorStyle}>
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {progress ? (
        <section style={sectionStyle} aria-live="polite">
          <div style={progressLineStyle}>
            <span style={progressLabelStyle}>
              {total > 0 ? formatOcrProgress(progress) : progress.status}
            </span>
            {progress.engine && (
              <span style={engineBadgeStyle}>
                {progress.engine === "paddle" ? "PaddleOCR" : "Tesseract"}
              </span>
            )}
          </div>
          <div style={trackStyle}>
            <div
              style={{
                ...fillStyle,
                width: `${percent}%`,
                backgroundColor: complete
                  ? "var(--c-success, #2f8f5b)"
                  : "var(--c-accent, #2f6feb)",
              }}
            />
          </div>
          <div style={metaStyle}>
            {complete ? (
              <>
                <CheckCircle2 size={13} />
                <span>OCR complete. The searchable copy is ready.</span>
              </>
            ) : (
              <>
                <Loader2 size={13} className="spin" />
                <span>
                  {busy
                    ? "Keep this tab open; OCR runs page by page."
                    : "Start when you are ready."}
                </span>
              </>
            )}
          </div>
        </section>
      ) : (
        <section style={sectionStyle}>
          <div style={metaStyle}>
            <ScanText size={13} />
            <span>
              The editor will read every page from page 1 and add an invisible text layer.
            </span>
          </div>
        </section>
      )}

      <div style={buttonRowStyle}>
        {busy && onCancel && (
          <button type="button" className="btn-secondary-rounded" onClick={onCancel}>
            <X size={14} />
            Cancel OCR
          </button>
        )}
        {!busy && !progress && onStart && (
          <button type="button" className="btn-primary-rounded" onClick={onStart}>
            <ScanText size={14} />
            Start OCR
          </button>
        )}
        {!busy && (progress || error) && (
          <button type="button" className="btn-primary-rounded" onClick={onClose}>
            Close
          </button>
        )}
        {!busy && !progress && !error && !onStart && (
          <button type="button" className="btn-primary-rounded" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </Modal>
  );
}

const headerStyle = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 16,
} as const;

const iconWrapStyle = {
  width: 36,
  height: 36,
  borderRadius: "var(--radius-md, 10px)",
  display: "grid",
  placeItems: "center",
  backgroundColor: "var(--c-bg-varied-1)",
  color: "var(--c-text)",
  flex: "0 0 auto",
} as const;

const titleStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--c-text)",
} as const;

const introStyle = {
  margin: "4px 0 0",
  fontSize: 12,
  lineHeight: 1.55,
  color: "var(--c-text-muted)",
} as const;

const sectionStyle = {
  padding: 14,
  borderRadius: "var(--radius-md, 12px)",
  backgroundColor: "var(--c-bg-varied-1)",
  marginBottom: 14,
} as const;

const progressLineStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 9,
} as const;

const progressLabelStyle = {
  fontSize: 13,
  fontWeight: 650,
  color: "var(--c-text)",
} as const;

const engineBadgeStyle = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.02em",
  padding: "3px 7px",
  borderRadius: 999,
  backgroundColor: "var(--c-bg)",
  color: "var(--c-text-muted)",
  border: "1px solid var(--c-border)",
} as const;

const trackStyle = {
  height: 7,
  borderRadius: 999,
  overflow: "hidden",
  backgroundColor: "var(--c-bg)",
  border: "1px solid var(--c-border)",
} as const;

const fillStyle = {
  height: "100%",
  borderRadius: 999,
  transition: "width 180ms ease",
} as const;

const metaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 9,
  fontSize: 11.5,
  color: "var(--c-text-muted)",
} as const;

const errorStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "10px 12px",
  borderRadius: "var(--radius-md, 10px)",
  marginBottom: 14,
  backgroundColor: "var(--c-danger-soft, rgba(190, 60, 60, 0.12))",
  color: "var(--c-danger, #a33)",
  fontSize: 12,
} as const;

const buttonRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
} as const;
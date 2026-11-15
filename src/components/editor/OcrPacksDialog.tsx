"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import { Modal } from "./Dialogs";
import {
  OCR_MANIFEST,
  getPacksSummary,
  importPack,
  removePack,
  formatBytes,
  type OcrPackStatus,
  type OcrStorageSummary,
} from "@/lib/ocr/packs";
import { useEditorStore } from "@/store/editor-store";
import {
  HardDrive,
  Upload,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileCheck,
  ShieldCheck,
  Languages,
  Check,
} from "lucide-react";

export function OcrPacksDialog({ onClose }: { onClose: () => void }) {
  const ocrLanguage = useEditorStore((s) => s.ocrLanguage);
  const setOcrLanguage = useEditorStore((s) => s.setOcrLanguage);

  const [summary, setSummary] = useState<OcrStorageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "installed" | "missing">("all");
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const reloadSummary = async () => {
    try {
      const data = await getPacksSummary();
      setSummary(data);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadSummary();
  }, []);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".traineddata.gz") && !file.name.endsWith(".traineddata")) {
      setFeedback({
        type: "error",
        message: `Invalid file format "${file.name}". Please provide an authentic Tesseract model file ending in .traineddata.gz`,
      });
      return;
    }

    setImporting(true);
    setFeedback({
      type: "info",
      message: `Reading and validating SHA-256 for "${file.name}" against offline manifest…`,
    });

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Derive suggested code from filename (e.g. "deu.traineddata.gz" -> "deu")
      const baseName = file.name.replace(/\.traineddata(\.gz)?$/i, "").toLowerCase();

      const result = await importPack(bytes, baseName);
      if (result.success) {
        setFeedback({
          type: "success",
          message: `Successfully verified and installed "${result.label}" (${result.code}). Ready for offline recognition.`,
        });
        startTransition(() => {
          setOcrLanguage(result.code);
        });
        await reloadSummary();
      } else {
        setFeedback({
          type: "error",
          message: result.error || "Pack verification failed.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error reading language pack.",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleRemove = async (code: string, label: string) => {
    if (!confirm(`Remove language pack "${label}" (${code}) from browser storage?`)) return;
    const removed = await removePack(code);
    if (removed) {
      if (ocrLanguage === code) {
        setOcrLanguage("eng");
      }
      setFeedback({
        type: "info",
        message: `Removed "${label}" pack from storage.`,
      });
      await reloadSummary();
    }
  };

  const installedPacks = summary?.packs.filter((p) => p.installed) ?? [];
  const missingPacks = summary?.packs.filter((p) => !p.installed) ?? [];
  const displayedPacks =
    filter === "installed" ? installedPacks : filter === "missing" ? missingPacks : summary?.packs ?? [];

  return (
    <Modal title="OCR Language Packs & Offline Storage" onClose={onClose} wide width={680}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Air-gapped privacy badge */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "12px 14px",
            borderRadius: "var(--radius-btn)",
            backgroundColor: "var(--c-surface-subtle)",
            border: "1px solid var(--c-border-subtle)",
          }}
        >
          <ShieldCheck size={20} style={{ color: "var(--c-primary)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: "var(--c-text-muted)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--c-text)" }}>Air-Gapped & Offline Verification:</strong> All 23 languages
            ship with the app, so recognition never makes a network call. Language data is verified against the offline
            SHA-256 manifest at build time; nothing is downloaded at runtime.
          </div>
        </div>

        {/* Stats banner & active language */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-btn)",
              backgroundColor: "var(--c-surface)",
              border: "1px solid var(--c-border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <HardDrive size={22} style={{ color: "var(--c-primary)" }} />
            <div>
              <div style={{ fontSize: 11, color: "var(--c-text-muted)", textTransform: "uppercase" }}>
                Total Disk Usage
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--c-text)" }}>
                {summary ? formatBytes(summary.totalDiskUsageBytes) : "…"}
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--c-text-muted)", marginLeft: 6 }}>
                  ({installedPacks.length} / {OCR_MANIFEST.packs.length} packs)
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-btn)",
              backgroundColor: "var(--c-surface)",
              border: "1px solid var(--c-border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Languages size={22} style={{ color: "var(--c-primary)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--c-text-muted)", textTransform: "uppercase" }}>
                Active Recognition Language
              </div>
              <select
                aria-label="Active Recognition Language"
                value={ocrLanguage}
                onChange={(e) => setOcrLanguage(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "4px 8px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--c-text)",
                  backgroundColor: "var(--c-surface-elevated)",
                  border: "1px solid var(--c-border)",
                  borderRadius: "var(--radius-btn)",
                  cursor: "pointer",
                }}
              >
                {installedPacks.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label} ({p.code}) {p.vendored ? "· Bundled" : "· Installed"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Drag and drop import zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "var(--c-primary)" : "var(--c-border)"}`,
            borderRadius: "var(--radius-card)",
            padding: "20px 16px",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: dragOver ? "var(--c-surface-subtle)" : "transparent",
            transition: "all 150ms ease",
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".gz,.traineddata"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Upload
            size={24}
            style={{ margin: "0 auto 8px auto", color: dragOver ? "var(--c-primary)" : "var(--c-text-muted)" }}
          />
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)" }}>
            {importing ? "Verifying checksum and importing…" : "Drop a .traineddata.gz language pack here, or browse"}
          </div>
          <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 4 }}>
            Verified strictly against the offline SHA-256 manifest. Never fetched over the network.
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-btn)",
              fontSize: 12,
              lineHeight: 1.5,
              display: "flex",
              alignItems: "center",
              gap: 10,
              backgroundColor:
                feedback.type === "success"
                  ? "rgba(16, 185, 129, 0.12)"
                  : feedback.type === "error"
                  ? "rgba(239, 68, 68, 0.12)"
                  : "var(--c-surface-subtle)",
              color:
                feedback.type === "success"
                  ? "#10b981"
                  : feedback.type === "error"
                  ? "#ef4444"
                  : "var(--c-text)",
              border: `1px solid ${
                feedback.type === "success"
                  ? "rgba(16, 185, 129, 0.3)"
                  : feedback.type === "error"
                  ? "rgba(239, 68, 68, 0.3)"
                  : "var(--c-border-subtle)"
              }`,
            }}
          >
            {feedback.type === "success" && <CheckCircle2 size={16} />}
            {feedback.type === "error" && <AlertCircle size={16} />}
            {feedback.type === "info" && <FileCheck size={16} />}
            <span style={{ flex: 1 }}>{feedback.message}</span>
          </div>
        )}

        {/* Filter buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text)" }}>Available Languages</div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "installed", "missing"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: filter === mode ? 700 : 500,
                  borderRadius: 999,
                  border: "1px solid",
                  borderColor: filter === mode ? "var(--c-primary)" : "var(--c-border-subtle)",
                  backgroundColor: filter === mode ? "var(--c-surface-elevated)" : "transparent",
                  color: filter === mode ? "var(--c-primary)" : "var(--c-text-muted)",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {mode === "all"
                  ? `All (${summary?.totalCount ?? 23})`
                  : mode === "installed"
                  ? `Installed (${installedPacks.length})`
                  : `Missing (${missingPacks.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Packs list */}
        <div
          style={{
            maxHeight: 260,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingRight: 4,
          }}
        >
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--c-text-muted)", fontSize: 12 }}>
              Loading language pack catalog…
            </div>
          ) : displayedPacks.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--c-text-muted)", fontSize: 12 }}>
              No language packs in this view.
            </div>
          ) : (
            displayedPacks.map((pack) => (
              <PackRow
                key={pack.code}
                pack={pack}
                isSelected={ocrLanguage === pack.code}
                onSelect={() => setOcrLanguage(pack.code)}
                onRemove={() => void handleRemove(pack.code, pack.label)}
              />
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function PackRow({
  pack,
  isSelected,
  onSelect,
  onRemove,
}: {
  pack: OcrPackStatus;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderRadius: "var(--radius-btn)",
        backgroundColor: isSelected ? "var(--c-surface-elevated)" : "var(--c-surface)",
        border: `1px solid ${isSelected ? "var(--c-primary)" : "var(--c-border-subtle)"}`,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
        <div style={{ width: 18, display: "grid", placeItems: "center" }}>
          {pack.installed ? (
            <CheckCircle2 size={16} style={{ color: "#10b981" }} />
          ) : (
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "var(--c-border)",
              }}
            />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)" }}>{pack.label}</span>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                padding: "1px 5px",
                borderRadius: 4,
                backgroundColor: "var(--c-surface-subtle)",
                color: "var(--c-text-muted)",
              }}
            >
              {pack.code}
            </span>
            {pack.vendored && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 4,
                  backgroundColor: "rgba(59, 130, 246, 0.15)",
                  color: "#3b82f6",
                }}
              >
                Bundled
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 2 }}>
            {formatBytes(pack.installedBytes || pack.bytes)} · SHA-256: {pack.sha256.slice(0, 10)}…
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {pack.installed ? (
          <>
            <button
              type="button"
              onClick={onSelect}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-btn)",
                border: "1px solid",
                borderColor: isSelected ? "var(--c-primary)" : "var(--c-border)",
                backgroundColor: isSelected ? "var(--c-primary)" : "transparent",
                color: isSelected ? "#fff" : "var(--c-text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {isSelected ? (
                <>
                  <Check size={12} strokeWidth={2.5} /> Active
                </>
              ) : (
                "Select"
              )}
            </button>
            {!pack.vendored && (
              <button
                type="button"
                onClick={onRemove}
                title={`Remove ${pack.label} pack`}
                style={{
                  padding: 5,
                  borderRadius: "var(--radius-btn)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: "var(--c-text-muted)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
              >
                <Trash2 size={14} />
              </button>
            )}
          </>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: "var(--c-text-muted)",
              fontStyle: "italic",
              paddingRight: 6,
            }}
          >
            Missing
          </span>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  Upload,
} from "lucide-react";
import { Modal } from "@/components/editor/Dialogs";
import { TOOLS } from "@/lib/tools/catalog";
import {
  batchToolIds,
  MAX_BATCH_FILES,
  MAX_BATCH_TOTAL_BYTES,
  runBatch,
  type BatchProgress,
  type BatchResult,
} from "@/lib/batch/runner";
import {
  defaultRecipe,
  parseRecipe,
  recipeToJson,
  RecipeError,
} from "@/lib/batch/recipe";
import { readPdfFile } from "@/lib/document/validate";

const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.id, tool]));
const BATCHABLE = batchToolIds(TOOL_MAP.values());

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function batchZipName(recipeName: string | undefined): string {
  const stem =
    (recipeName || "batch")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim()
      .slice(0, 80) || "batch";
  return `${stem}-output.zip`;
}

export function BatchDialog({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [recipeText, setRecipeText] = useState(() => recipeToJson(defaultRecipe(BATCHABLE)));
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => {
    try {
      return {
        recipe: parseRecipe(recipeText, { allowedToolIds: BATCHABLE }),
        error: null as string | null,
      };
    } catch (error) {
      return {
        recipe: null,
        error: error instanceof RecipeError || error instanceof Error ? error.message : String(error),
      };
    }
  }, [recipeText]);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const steps = parsed.recipe
    ? parsed.recipe.steps
        .map((step) => TOOL_MAP.get(step.toolId)?.name ?? step.toolId)
        .join(" → ")
    : "";

  const close = () => {
    if (busy) {
      abortRef.current?.abort();
      abortRef.current = null;
      setBusy(false);
    }
    onClose();
  };

  const run = async () => {
    const recipe = parsed.recipe;
    if (!recipe || !files.length || busy) return;
    if (totalBytes > MAX_BATCH_TOTAL_BYTES) {
      setError(
        `The selected files total ${formatBytes(totalBytes)}; a batch is limited to ${formatBytes(MAX_BATCH_TOTAL_BYTES)}.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const inputs: Array<{ name: string; bytes: Uint8Array }> = [];
      for (const file of files) {
        inputs.push({ name: file.name, bytes: await readPdfFile(file) });
      }

      const output = await runBatch(recipe, inputs, { tools: TOOL_MAP }, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(output);
      if (!output.outputs.length) {
        setError(
          output.failures.length
            ? `No files completed: ${output.failures[0]?.message ?? "unknown error"}`
            : "No files were processed"
        );
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError("Batch cancelled");
      } else {
        setError(errorText(caught));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  };

  const download = async () => {
    if (!result?.outputs.length || zipping) return;
    setZipping(true);
    setError(null);
    try {
      const zip = new JSZip();
      result.outputs.forEach((output) => zip.file(output.fileName, output.bytes));
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, batchZipName(parsed.recipe?.name));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setZipping(false);
    }
  };

  return (
    <Modal title="Batch processing" onClose={close} width={760}>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 12.5,
          lineHeight: 1.55,
          color: "var(--c-text-muted)",
        }}
      >
        Apply a recipe to several PDFs and download one ZIP. Everything runs in this browser tab —
        files are never uploaded.
      </p>

      <label style={labelStyle} htmlFor="batch-files">
        <Upload size={14} strokeWidth={1.7} />
        <span>
          {files.length
            ? `${files.length} file(s) · ${formatBytes(totalBytes)}`
            : "Choose PDF files"}
        </span>
        <input
          id="batch-files"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          disabled={busy}
          onChange={(event) => {
            const next = Array.from(event.target.files ?? []).slice(0, MAX_BATCH_FILES);
            setFiles(next);
            setResult(null);
            setError(null);
            event.target.value = "";
          }}
        />
      </label>
      <div style={hintStyle}>
        Up to {MAX_BATCH_FILES} PDFs per batch. Content is validated by magic bytes, not by the
        file extension.
      </div>

      <div style={labelRowStyle}>
        <label style={fieldLabelStyle} htmlFor="batch-recipe">
          Recipe JSON
        </label>
        <button
          type="button"
          className="btn-secondary-rounded"
          onClick={() => setRecipeText(recipeToJson(defaultRecipe(BATCHABLE)))}
          disabled={busy}
          style={smallButtonStyle}
        >
          Reset example
        </button>
      </div>
      <textarea
        id="batch-recipe"
        value={recipeText}
        onChange={(event) => setRecipeText(event.target.value)}
        disabled={busy}
        spellCheck={false}
        rows={14}
        style={{
          ...textAreaStyle,
          borderColor: parsed.error ? "var(--danger)" : "var(--c-border-subtle)",
        }}
      />
      {parsed.error ? (
        <div style={{ ...messageStyle, color: "var(--danger)" }}>
          <AlertTriangle size={14} />
          <span>{parsed.error}</span>
        </div>
      ) : (
        <div style={{ ...messageStyle, color: "var(--c-text-muted)" }}>
          <CheckCircle2 size={14} />
          <span>{steps || "No steps"}</span>
        </div>
      )}

      {busy && (
        <div style={{ marginTop: 12 }}>
          <div style={progressLabelStyle}>
            <Loader2 size={13} className="spin" />
            <span>
              {progress
                ? `${progress.fileName} · ${progress.stepLabel} (${Math.round(progress.percent)}%)`
                : "Preparing…"}
            </span>
          </div>
          <div style={progressTrackStyle}>
            <div
              style={{
                width: `${progress?.percent ?? 0}%`,
                height: "100%",
                backgroundColor: "var(--c-primary)",
                transition: "width 160ms ease",
              }}
            />
          </div>
        </div>
      )}

      {error && !busy && (
        <div style={{ ...messageStyle, color: "var(--danger)" }}>
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 14 }}>
          <div style={resultSummaryStyle}>
            <span>
              {result.outputs.length} output(s) · {formatBytes(result.outputs.reduce((sum, item) => sum + item.bytes.byteLength, 0))}
            </span>
            {result.failures.length > 0 && (
              <span style={{ color: "var(--warning)" }}>
                {result.failures.length} failed
              </span>
            )}
          </div>
          <div style={resultListStyle}>
            {result.outputs.slice(0, 40).map((output) => (
              <div key={output.fileName} style={resultRowStyle}>
                <span>{output.fileName}</span>
                <span style={{ color: "var(--c-text-subtle)" }}>{formatBytes(output.bytes.byteLength)}</span>
              </div>
            ))}
            {result.failures.map((failure) => (
              <div
                key={`${failure.fileName}-${failure.stepLabel ?? ""}`}
                style={{ ...resultRowStyle, color: "var(--danger)" }}
              >
                <span>{failure.fileName}</span>
                <span>{failure.message}</span>
              </div>
            ))}
            {result.warnings.slice(0, 12).map((warning) => (
              <div key={warning} style={{ ...resultRowStyle, color: "var(--c-text-muted)" }}>
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-secondary-rounded" onClick={close}>
          {busy ? "Cancel" : "Close"}
        </button>
        {result && result.outputs.length > 0 && (
          <button
            type="button"
            className="btn-secondary-rounded"
            onClick={() => void download()}
            disabled={zipping || busy}
          >
            {zipping ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            Download ZIP
          </button>
        )}
        <button
          type="button"
          className="btn-primary-rounded"
          onClick={() => void run()}
          disabled={busy || !parsed.recipe || !files.length}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          Run batch
        </button>
      </div>
    </Modal>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 38,
  padding: "0 12px",
  borderRadius: "var(--radius-input)",
  border: "1px dashed var(--c-border-strong)",
  backgroundColor: "var(--c-surface-sunken)",
  color: "var(--c-text)",
  fontSize: 12.5,
  cursor: "pointer",
};

const hintStyle: React.CSSProperties = {
  fontSize: 10.5,
  lineHeight: 1.45,
  color: "var(--c-text-subtle)",
  marginTop: 5,
};

const labelRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 16,
  marginBottom: 6,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--c-text)",
};

const smallButtonStyle: React.CSSProperties = {
  height: 24,
  padding: "0 8px",
  fontSize: 10.5,
};

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 210,
  resize: "vertical",
  padding: "10px 12px",
  borderRadius: "var(--radius-input)",
  border: "1px solid var(--c-border-subtle)",
  backgroundColor: "var(--c-surface-sunken)",
  color: "var(--c-text)",
  fontSize: 11.5,
  lineHeight: 1.5,
  fontFamily: "var(--font-mono)",
  outline: "none",
};

const messageStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 7,
  marginTop: 7,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const progressLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 6,
  fontSize: 11.5,
  color: "var(--c-text-muted)",
};

const progressTrackStyle: React.CSSProperties = {
  width: "100%",
  height: 6,
  overflow: "hidden",
  borderRadius: 999,
  backgroundColor: "var(--c-border-subtle)",
};

const resultSummaryStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--c-text)",
  marginBottom: 6,
};

const resultListStyle: React.CSSProperties = {
  maxHeight: 220,
  overflow: "auto",
  borderRadius: "var(--radius-input)",
  border: "1px solid var(--c-border-subtle)",
  backgroundColor: "var(--c-surface-sunken)",
  padding: "4px 10px",
  fontSize: 11.5,
};

const resultRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "5px 0",
  borderTop: "1px solid var(--c-border-subtle)",
  lineHeight: 1.4,
};
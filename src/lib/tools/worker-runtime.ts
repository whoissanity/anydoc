/// <reference lib="webworker" />
import { sanitizePdf, updateMetadata } from "@/lib/document/optimize";
import type { ToolOutcome } from "@/lib/tools/catalog";

interface WorkerRequest {
  id: number;
  toolId: string;
  bytes: Uint8Array;
  values: Record<string, unknown>;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

function bool(values: Record<string, unknown>, key: string): boolean {
  return values[key] === true || values[key] === "true";
}

function text(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

async function run(request: WorkerRequest): Promise<ToolOutcome> {
  if (request.toolId === "sanitize") {
    const result = await sanitizePdf(request.bytes, {
      metadata: bool(request.values, "metadata"),
      javascript: bool(request.values, "javascript"),
      attachments: bool(request.values, "attachments"),
      annotations: bool(request.values, "annotations"),
      removeXmp: bool(request.values, "xmp"),
      forms: text(request.values, "forms") as "keep" | "flatten" | "remove",
    });
    return {
      bytes: result.bytes,
      message: result.report.length
        ? `Sanitized — ${result.report.join(" ")}`
        : "Nothing to remove",
      report: {
        title: "Sanitization report",
        lines: result.report,
      },
    };
  }

  if (request.toolId === "metadata") {
    const bytes = await updateMetadata(request.bytes, {
      title: text(request.values, "title"),
      author: text(request.values, "author"),
      subject: text(request.values, "subject"),
      keywords: text(request.values, "keywords"),
      creator: text(request.values, "creator"),
      producer: text(request.values, "producer"),
    });
    return { bytes, message: "Document properties updated" };
  }

  throw new Error("This tool cannot run in the background worker");
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    scope.postMessage({ id: request.id, progress: 10, message: "Preparing…" });
    const outcome = await run(request);
    scope.postMessage({ id: request.id, progress: 100, message: "Finishing…" });
    const transfer = outcome.bytes ? [outcome.bytes.buffer as ArrayBuffer] : [];
    scope.postMessage({ id: request.id, ok: true, outcome }, transfer);
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Worker failed",
    });
  }
};
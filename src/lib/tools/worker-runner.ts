import type { ToolOutcome } from "@/lib/tools/catalog";
import { isDetachedBytes } from "@/lib/document/validate";

interface WorkerReply {
  id: number;
  ok?: boolean;
  progress?: number;
  message?: string;
  outcome?: ToolOutcome;
  error?: string;
}

const TOOL_TIMEOUT_MS = 120_000;

let worker: Worker | null = null;
let nextId = 1;

function workerFor(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./worker-runtime.ts", import.meta.url), { type: "module" });
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

function teardown() {
  worker?.terminate();
  worker = null;
}

export function workerSupported(): boolean {
  return typeof Worker !== "undefined";
}

export function runInWorker(
  toolId: string,
  bytes: Uint8Array,
  values: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: (message: string, percent: number) => void
): Promise<ToolOutcome> {
  const active = workerFor();
  if (!active) return Promise.reject(new Error("Background worker unavailable"));
  if (signal?.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  if (isDetachedBytes(bytes)) {
    return Promise.reject(new Error("The document bytes are unavailable — reopen the file"));
  }

  const id = nextId++;
  // Clone: the worker transfer detaches the copy, never the store's bytes.
  const copy = bytes.slice();

  return new Promise<ToolOutcome>((resolve, reject) => {
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      active.removeEventListener("message", onMessage);
      active.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    const onMessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (!reply || reply.id !== id) return;
      if (reply.progress !== undefined) {
        onProgress?.(reply.message ?? "Working…", reply.progress);
        return;
      }
      cleanup();
      if (reply.ok && reply.outcome) resolve(reply.outcome);
      else reject(new Error(reply.error || "Worker failed"));
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      teardown();
      reject(new Error(event.message || "Worker crashed"));
    };

    const onAbort = () => {
      cleanup();
      teardown();
      reject(new DOMException("Cancelled", "AbortError"));
    };

    active.addEventListener("message", onMessage);
    active.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });

    timer = setTimeout(() => {
      cleanup();
      teardown();
      reject(new Error(`The operation timed out after ${TOOL_TIMEOUT_MS / 1000}s`));
    }, TOOL_TIMEOUT_MS);

    try {
      active.postMessage({ id, toolId, bytes: copy, values }, [copy.buffer]);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Could not start worker"));
    }
  });
}
/** Serialises PDF.js renders: overlapping render tasks stall each other, so only one page paints at a time. */

let tail: Promise<unknown> = Promise.resolve();

export function withRenderLock<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export class RenderTimeoutError extends Error {
  constructor(message = "Page render timed out") {
    super(message);
    this.name = "RenderTimeoutError";
  }
}

/**
 * Runs `task` with an AbortSignal that fires after `timeoutMs`. The task is
 * responsible for turning the abort into a PDF.js `renderTask.cancel()`; a
 * malformed page that never settles cannot pin the render queue forever.
 */
export function withRenderTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message = "Page render timed out"
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RenderTimeoutError(message));
    }, timeoutMs);
  });

  const work = task(controller.signal);
  // If the timeout wins, the cancelled task may still reject later; keep it handled.
  work.catch(() => undefined);

  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

interface RenderTaskLike {
  promise: Promise<unknown>;
  cancel: () => void;
}

/** PDF.js render wrapper: abort cancels the task instead of leaking a worker paint. */
export async function renderPageWithTimeout(
  page: { render: (options: unknown) => RenderTaskLike },
  options: unknown,
  timeoutMs: number,
  message?: string
): Promise<void> {
  await withRenderTimeout(async (signal) => {
    const task = page.render(options);
    const cancel = () => {
      try {
        task.cancel();
      } catch {
        // Cancelling an already-finished task throws in some PDF.js versions.
      }
    };
    if (signal.aborted) {
      cancel();
      throw new Error("Render aborted");
    }
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await task.promise;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }, timeoutMs, message);
}
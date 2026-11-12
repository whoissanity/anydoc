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

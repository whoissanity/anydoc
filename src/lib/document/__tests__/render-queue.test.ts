import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RenderTimeoutError,
  renderPageWithTimeout,
  withRenderTimeout,
} from "@/lib/document/render-queue";

afterEach(() => {
  vi.useRealTimers();
});

describe("withRenderTimeout", () => {
  it("returns the task result before the deadline", async () => {
    vi.useFakeTimers();
    const signalRef: { current: AbortSignal | null } = { current: null };
    const promise = withRenderTimeout(async (signal) => {
      signalRef.current = signal;
      return "done";
    }, 1_000);

    await expect(promise).resolves.toBe("done");
    expect(signalRef.current?.aborted).toBe(false);
  });

  it("aborts the signal and rejects when the task never settles", async () => {
    vi.useFakeTimers();
    const holder: { signal: AbortSignal | null } = { signal: null };
    const promise = withRenderTimeout(
      (signal) => {
        holder.signal = signal;
        return new Promise<string>(() => undefined);
      },
      1_000,
      "page stalled"
    );
    const assertion = expect(promise).rejects.toBeInstanceOf(RenderTimeoutError);

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(holder.signal?.aborted).toBe(true);
  });
});

describe("renderPageWithTimeout", () => {
  it("cancels a render that outlives its deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const page = {
      render: () => ({ promise: new Promise<void>(() => undefined), cancel }),
    };

    const promise = renderPageWithTimeout(page, {}, 500, "thumbnail stalled");
    const assertion = expect(promise).rejects.toBeInstanceOf(RenderTimeoutError);

    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("resolves when the render completes", async () => {
    const cancel = vi.fn();
    const page = {
      render: () => ({ promise: Promise.resolve(), cancel }),
    };
    await expect(renderPageWithTimeout(page, {}, 1_000)).resolves.toBeUndefined();
    expect(cancel).not.toHaveBeenCalled();
  });
});
import { webcrypto } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runFormScript } from "@/lib/edit/forms";

const TIMEOUT_MS = 2000;

beforeAll(() => {
  // jsdom's Crypto does not always expose randomUUID; Node's webcrypto provides the same primitive.
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

afterEach(() => {
  vi.useRealTimers();
});

/** Runs a script with fake timers and returns the iframe the sandbox attached. */
function start(script = "event.value") {
  const append = vi.spyOn(document.body, "appendChild");
  const promise = runFormScript(script, { fields: { total: "10" }, eventValue: "" });
  const iframe = append.mock.calls[0]?.[0] as unknown as HTMLIFrameElement | undefined;
  if (!iframe) throw new Error("sandbox iframe was not appended");
  return { promise, iframe, append };
}

function nonceOf(iframe: HTMLIFrameElement): string {
  const match = /var NONCE = "([^"]+)"/.exec(iframe.srcdoc);
  if (!match) throw new Error("nonce not found in sandbox document");
  return match[1];
}

function send(data: unknown, source: MessageEventSource | null) {
  window.dispatchEvent(new MessageEvent("message", { data, source }));
}

describe("runFormScript sandbox", () => {
  it("short-circuits without a script, and refuses oversized scripts", async () => {
    await expect(runFormScript("   ", { fields: {}, eventValue: "x" })).resolves.toEqual({
      ok: true,
      value: "x",
    });

    await expect(runFormScript("a".repeat(20_001), { fields: {} })).resolves.toEqual({
      ok: false,
      error: "Calculate script is too long (20 KB limit)",
    });
  });

  it("isolates execution: opaque origin, no same-origin access, no network", () => {
    vi.useFakeTimers();
    const { iframe } = start();

    // `allow-scripts` without `allow-same-origin` puts the frame on an opaque origin: no DOM, storage or session access.
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(iframe.getAttribute("aria-hidden")).toBe("true");

    // The document's own CSP removes every network channel.
    expect(iframe.srcdoc).toContain("default-src 'none'");
    expect(iframe.srcdoc).toContain("parent.postMessage");
    expect(iframe.srcdoc).not.toContain("allow-same-origin");
  });

  it("times out instead of hanging when the sandbox never answers", async () => {
    vi.useFakeTimers();
    const { promise, iframe } = start();

    vi.advanceTimersByTime(TIMEOUT_MS);

    await expect(promise).resolves.toEqual({
      ok: false,
      error: "Calculate script timed out",
    });
    // The frame must not be left in the document after settling.
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("ignores replies that do not come from its own frame or carry the wrong nonce", async () => {
    vi.useFakeTimers();
    const { promise, iframe } = start();
    const nonce = nonceOf(iframe);
    const post = vi.spyOn(iframe.contentWindow!, "postMessage");

    // Wrong nonce, even from the right frame.
    send({ nonce: "not-the-nonce", ready: true }, iframe.contentWindow);
    // Right nonce, but from the parent window rather than the sandbox.
    send({ nonce, ready: true }, window);
    expect(post).not.toHaveBeenCalled();

    // A forged result must not settle the run either.
    send({ nonce, ok: true, value: "forged" }, window);
    await expect(
      Promise.race([promise.then(() => "settled"), Promise.resolve("pending")])
    ).resolves.toBe("pending");

    // The genuine handshake delivers the script once.
    send({ nonce, ready: true }, iframe.contentWindow);
    expect(post).toHaveBeenCalledTimes(1);
    const delivered = post.mock.calls[0][0] as { script: string; nonce: string };
    expect(delivered.nonce).toBe(nonce);
    expect(delivered.script).toBe("event.value");

    // ...and only the genuine reply settles it.
    send({ nonce, ok: true, value: "10" }, iframe.contentWindow);
    await expect(promise).resolves.toEqual({ ok: true, value: "10" });
  });

  it("keeps concurrent runs separate", async () => {
    vi.useFakeTimers();
    const first = start("event.value + 1");
    const append = first.append;
    const secondPromise = runFormScript("event.value + 2", { fields: {}, eventValue: "" });
    const secondIframe = append.mock.calls[1]?.[0] as unknown as HTMLIFrameElement;

    const firstNonce = nonceOf(first.iframe);
    send({ nonce: firstNonce, ok: true, value: 11 }, first.iframe.contentWindow);

    await expect(first.promise).resolves.toEqual({ ok: true, value: 11 });
    await expect(
      Promise.race([secondPromise.then(() => "settled"), Promise.resolve("pending")])
    ).resolves.toBe("pending");

    // The second run is still bound to its own timeout and cleans up separately.
    vi.advanceTimersByTime(TIMEOUT_MS);
    await expect(secondPromise).resolves.toEqual({
      ok: false,
      error: "Calculate script timed out",
    });
    expect(document.body.contains(secondIframe)).toBe(false);
  });
});

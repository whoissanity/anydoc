"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Counts the network destinations this tab actually contacts.
 *
 * AnyDoc is client-side only, so the honest number for cross-origin requests
 * is zero. Rather than assert that in marketing, instrument the few APIs that
 * can leave the page (fetch, XHR, beacon, WebSocket, EventSource) and the
 * resource timeline for loaded assets. Everything stays in memory; no request
 * URL is ever stored or transmitted.
 */

export type NetworkVerdict = "external" | "local" | "ignored";

export interface NetworkSnapshot {
  /** True once instrumentation is running in this tab. */
  active: boolean;
  /** Distinct destinations outside this origin. */
  external: readonly string[];
  /** Same-origin requests and asset loads observed. */
  local: number;
}

const IGNORED_PREFIXES = [
  "data:",
  "blob:",
  "about:",
  "javascript:",
  "mailto:",
  "tel:",
  "file:",
  "chrome-extension:",
];

/** Classifies a request target against the page origin. Pure, so it is testable. */
export function classifyNetworkUrl(raw: string, origin: string): NetworkVerdict {
  const value = raw.trim();
  if (!value || value.startsWith("#")) return "ignored";
  if (IGNORED_PREFIXES.some((prefix) => value.toLowerCase().startsWith(prefix))) return "ignored";

  let target: URL;
  let page: URL;
  try {
    page = new URL(origin);
    target = new URL(value, page);
  } catch {
    return "ignored";
  }

  if (!["http:", "https:", "ws:", "wss:"].includes(target.protocol)) return "ignored";
  // WebSockets share the host but not the scheme; compare hosts, not origins.
  return target.host === page.host ? "local" : "external";
}

const EMPTY: NetworkSnapshot = { active: false, external: [], local: 0 };
let snapshot: NetworkSnapshot = EMPTY;
const listeners = new Set<() => void>();
let installed = false;

function publish(next: Partial<NetworkSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function recordExternal(url: string, kind: string) {
  // One destination is one event, even if the fetch wrapper and the CSP
  // violation both report the same blocked request.
  if (snapshot.external.some((entry) => entry.endsWith(` ${url}`))) return;
  publish({ external: [...snapshot.external, `${kind} ${url}`].slice(-20) });
}

function record(raw: string, kind: string) {
  if (!installed || typeof location === "undefined") return;
  const verdict = classifyNetworkUrl(raw, location.origin);
  if (verdict === "ignored") return;
  if (verdict === "external") {
    recordExternal(raw, kind);
    return;
  }
  publish({ local: snapshot.local + 1 });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function observeResources() {
  const seen = new Set<string>();
  const ingest = (name: string, initiator: string) => {
    // fetch/XHR are already counted by their wrappers; counting them here doubles.
    if (initiator === "fetch" || initiator === "xmlhttprequest") return;
    if (seen.has(name)) return;
    seen.add(name);
    record(name, "asset");
  };

  try {
    for (const entry of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      ingest(entry.name, entry.initiatorType);
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        ingest(entry.name, entry.initiatorType);
      }
    });
    observer.observe({ type: "resource", buffered: false });
  } catch {
    // Resource timing is unavailable in some browsers; the API wrappers still count.
  }
}

/** Installs the wrappers once per tab. Safe to call from an effect repeatedly. */
export function installNetworkMonitor(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function monitoredFetch(
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit
    ) {
      record(requestUrl(input), "fetch");
      return originalFetch.call(this, input, init);
    };
  }

  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function monitoredOpen(
    this: XMLHttpRequest & { __anydocUrl?: string },
    ...args: unknown[]
  ) {
    const url = args[1];
    if (typeof url === "string" || url instanceof URL) this.__anydocUrl = String(url);
    return (xhrOpen as (...params: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;

  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function monitoredSend(
    this: XMLHttpRequest & { __anydocUrl?: string },
    ...args: unknown[]
  ) {
    if (this.__anydocUrl) record(this.__anydocUrl, "XHR");
    return (xhrSend as (...params: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.send;

  if (navigator.sendBeacon) {
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      record(String(url), "beacon");
      return beacon(url, data);
    };
  }

  const instrumentConstructor = <T extends new (...args: never[]) => unknown>(
    Native: T | undefined,
    kind: string
  ) => {
    if (!Native) return Native;
    return new Proxy(Native, {
      construct(target, args) {
        record(String(args[0] ?? ""), kind);
        return Reflect.construct(target, args);
      },
    });
  };
  window.WebSocket = instrumentConstructor(window.WebSocket, "WebSocket") as typeof WebSocket;
  window.EventSource = instrumentConstructor(
    window.EventSource,
    "EventSource"
  ) as typeof EventSource;

  window.addEventListener("securitypolicyviolation", (event) => {
    if (event.blockedURI) record(event.blockedURI, "CSP-blocked");
  });

  observeResources();
  publish({ active: true });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): NetworkSnapshot {
  return snapshot;
}

function getServerSnapshot(): NetworkSnapshot {
  return EMPTY;
}

/** Live cross-origin request count for the current tab. */
export function useNetworkActivity(): NetworkSnapshot {
  useEffect(() => {
    installNetworkMonitor();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

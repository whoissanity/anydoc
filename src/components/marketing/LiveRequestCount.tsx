"use client";

import { useNetworkActivity } from "@/lib/privacy/network-monitor";

/**
 * The product claim, measured. Reads the in-memory network monitor; nothing is
 * stored or sent. Renders 0 on the server and live after hydration.
 */
export function LiveRequestCount({ variant = "hero" }: { variant?: "hero" | "inline" }) {
  const { external, local } = useNetworkActivity();
  const count = external.length;
  const clean = count === 0;

  if (variant === "inline") {
    return (
      <span className="mkt-count-inline" data-clean={clean} aria-live="polite">
        {count} external {count === 1 ? "request" : "requests"}
      </span>
    );
  }

  return (
    <div className="mkt-count" data-clean={clean}>
      <p className="mkt-count-number" aria-live="polite">
        <span className="sr-only">
          {count} requests sent off this device since you opened this page.
        </span>
        <span aria-hidden="true">§{String(count).padStart(2, "0")}</span>
      </p>
      <div className="mkt-count-meta">
        <p className="mkt-count-label">
          requests sent off this device
          <br />
          since you opened this page
        </p>
        <p className="mkt-count-sub">
          {local} same-origin file loads. Open your browser&apos;s Network tab and check.
        </p>
      </div>
    </div>
  );
}

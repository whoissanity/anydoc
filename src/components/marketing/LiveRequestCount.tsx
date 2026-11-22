"use client";

import { useI18n } from "@/components/providers/I18nProvider";
import { useNetworkActivity } from "@/lib/privacy/network-monitor";

/**
 * The product claim, measured. Reads the in-memory network monitor; nothing is
 * stored or sent. Renders 0 on the server and live after hydration.
 */
export function LiveRequestCount({ variant = "hero" }: { variant?: "hero" | "inline" }) {
  const { t } = useI18n();
  const { external, local } = useNetworkActivity();
  const count = external.length;
  const clean = count === 0;

  if (variant === "inline") {
    const inlineKey =
      count === 0
        ? "privacy.network.pillClean"
        : count === 1
          ? "privacy.network.pillOne"
          : "privacy.network.pillMany";
    return (
      <span className="mkt-count-inline" data-clean={clean} aria-live="polite">
        {t(inlineKey, { count })}
      </span>
    );
  }

  return (
    <div className="mkt-count" data-clean={clean}>
      <p className="mkt-count-number" aria-live="polite">
        <span className="sr-only">
          {count} {t("mkt.countLabel1")} {t("mkt.countLabel2")}
        </span>
        <span aria-hidden="true">{count}</span>
      </p>
      <div className="mkt-count-meta">
        <p className="mkt-count-label">
          {t("mkt.countLabel1")}
          <br />
          {t("mkt.countLabel2")}
        </p>
        <p className="mkt-count-sub">{t("mkt.countSub", { local })}</p>
      </div>
    </div>
  );
}

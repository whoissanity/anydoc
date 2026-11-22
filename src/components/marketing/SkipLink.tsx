"use client";

import { useI18n } from "@/components/providers/I18nProvider";

export function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="mkt-skip" href="#main">
      {t("mkt.skip")}
    </a>
  );
}

"use client";

import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";
import { BrandMark } from "@/components/shared/BrandMark";
import { LanguageSelector } from "@/components/shared/LanguageSelector";
import { SITE } from "@/lib/site";

export function SiteHeader() {
  const { t } = useI18n();

  return (
    <header className="mkt-header">
      <div className="mkt-container mkt-header-inner">
        <Link href="/" className="mkt-brand">
          <BrandMark />
          <span>{SITE.name}</span>
        </Link>

        <nav className="mkt-nav" aria-label="Primary">
          <Link href="/#privacy">{t("nav.privacy")}</Link>
          <Link href="/#tools">{t("nav.tools")}</Link>
          <Link href="/#open-source">{t("nav.source")}</Link>
          <LanguageSelector />
          <Link href={SITE.editorHref} className="mkt-nav-cta">
            {t("nav.openEditor")}
          </Link>
        </nav>
      </div>
    </header>
  );
}

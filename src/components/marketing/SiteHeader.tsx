<<<<<<< HEAD
import Link from "next/link";
import { SITE } from "@/lib/site";

export function SiteHeader() {
=======
"use client";

import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";
import { BrandMark } from "@/components/shared/BrandMark";
import { LanguageSelector } from "@/components/shared/LanguageSelector";
import { SITE } from "@/lib/site";

export function SiteHeader() {
  const { t } = useI18n();

>>>>>>> origin/v0/anydoc-design-system
  return (
    <header className="mkt-header">
      <div className="mkt-container mkt-header-inner">
        <Link href="/" className="mkt-brand">
<<<<<<< HEAD
          <span className="mkt-brand-mark" aria-hidden="true">
            A
          </span>
=======
          <BrandMark />
>>>>>>> origin/v0/anydoc-design-system
          <span>{SITE.name}</span>
        </Link>

        <nav className="mkt-nav" aria-label="Primary">
<<<<<<< HEAD
          <Link href="/#features">Features</Link>
          <Link href="/#privacy">Privacy</Link>
          <Link href="/#open-source">Open source</Link>
          <Link href="/#about">About</Link>
          <Link href={SITE.editorHref} className="mkt-nav-cta">
            Open the Editor
=======
          <Link href="/#privacy">{t("nav.privacy")}</Link>
          <Link href="/#tools">{t("nav.tools")}</Link>
          <Link href="/#open-source">{t("nav.source")}</Link>
          <LanguageSelector />
          <Link href={SITE.editorHref} className="mkt-nav-cta">
            {t("nav.openEditor")}
>>>>>>> origin/v0/anydoc-design-system
          </Link>
        </nav>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";
import { LiveRequestCount } from "@/components/marketing/LiveRequestCount";
import { FormatSpectrum } from "@/components/shared/FormatSpectrum";
import { SITE } from "@/lib/site";

export function MarketingHero() {
  const { t } = useI18n();

  return (
    <section className="mkt-hero" aria-labelledby="hero-title">
      <div className="mkt-container">
        <p className="mkt-mono-line">{t("mkt.eyebrow")}</p>
        <h1 id="hero-title">{t("mkt.tagline")}</h1>

        <LiveRequestCount />

        <div className="mkt-actions">
          <Link href={SITE.editorHref} className="mkt-btn mkt-btn-primary">
            {t("landing.openEditor")}
          </Link>
          <a href={SITE.repo} className="mkt-btn mkt-btn-secondary">
            {t("mkt.readSource")}
          </a>
        </div>

        <FormatSpectrum className="mkt-spectrum" />
      </div>
    </section>
  );
}

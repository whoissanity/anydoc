"use client";

import Link from "next/link";
import { SITE } from "@/lib/site";
import { useI18n } from "@/components/providers/I18nProvider";

/** Legal copy is static, so it lives in the locale files like the rest of the UI. */
export function PrivacyContent() {
  const { t } = useI18n();
  return (
    <main id="main" tabIndex={-1} className="mkt-legal">
      <div className="mkt-container">
        <p className="mkt-kicker">{t("legal.kicker")}</p>
        <h1>{t("privacy.title")}</h1>
        <p className="mkt-legal-updated">{t("legal.updated")}</p>
        <p className="mkt-legal-intro">{t("privacy.intro")}</p>

        <h2>{t("privacy.noAccountsTitle")}</h2>
        <p>{t("privacy.noAccountsBody")}</p>

        <h2>{t("privacy.noTrackingTitle")}</h2>
        <p>{t("privacy.noTrackingIntro")}</p>
        <ul>
          <li>{t("privacy.cookies")}</li>
          <li>{t("privacy.storage")}</li>
          <li>{t("privacy.analytics")}</li>
          <li>{t("privacy.offDevice")}</li>
        </ul>
        <p>{t("privacy.draftBody")}</p>
        <p>{t("privacy.draftEncryption")}</p>
        <p>{t("privacy.draftLimit")}</p>
        <p>{t("privacy.draftControl")}</p>

        <h2>{t("privacy.hostingTitle")}</h2>
        <p>{t("privacy.hostingBody")}</p>

        <h2>{t("privacy.noSellTitle")}</h2>
        <p>{t("privacy.noSellBody")}</p>

        <h2>{t("privacy.childrenTitle")}</h2>
        <p>{t("privacy.childrenBody")}</p>

        <h2>{t("privacy.contactTitle")}</h2>
        <p>
          {t("privacy.contactBody")}{" "}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>

        <h2>{t("privacy.changesTitle")}</h2>
        <p>{t("privacy.changesBody")}</p>

        <p className="mkt-legal-back">
          <Link href="/">{t("legal.back")}</Link>
        </p>
      </div>
    </main>
  );
}

export function TermsContent() {
  const { t } = useI18n();
  return (
    <main id="main" tabIndex={-1} className="mkt-legal">
      <div className="mkt-container">
        <p className="mkt-kicker">{t("legal.kicker")}</p>
        <h1>{t("terms.title")}</h1>
        <p className="mkt-legal-updated">{t("legal.updated")}</p>
        <p className="mkt-legal-intro">{t("terms.intro")}</p>

        <h2>{t("terms.asisTitle")}</h2>
        <p>{t("terms.asisBody")}</p>
        <p>{t("terms.autosaveBody")}</p>

        <h2>{t("terms.acceptableTitle")}</h2>
        <ul>
          <li>{t("terms.acceptableIllegal")}</li>
          <li>{t("terms.acceptableAbuse")}</li>
        </ul>

        <h2>{t("terms.licenseTitle")}</h2>
        <p>
          {t("terms.licenseBody")} <a href={SITE.license}>MIT License</a>.
        </p>
        <p>{t("terms.ownershipBody")}</p>

        <h2>{t("terms.ageTitle")}</h2>
        <p>
          {t("terms.ageBody")}{" "}
          <span className="mkt-placeholder">{t("terms.agePlaceholder")}</span>
        </p>

        <h2>{t("terms.lawTitle")}</h2>
        <p>
          {t("terms.lawBody")}{" "}
          <span className="mkt-placeholder">{t("terms.lawPlaceholder")}</span>.{" "}
          <span className="mkt-placeholder">{t("terms.venuePlaceholder")}</span>
        </p>

        <h2>{t("terms.contactTitle")}</h2>
        <p>
          {t("terms.contactBody")}{" "}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>

        <p className="mkt-legal-back">
          <Link href="/">{t("legal.back")}</Link>
        </p>
      </div>
    </main>
  );
}

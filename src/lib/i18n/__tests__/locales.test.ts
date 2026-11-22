import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";

const PRIVACY_NETWORK_KEYS = [
  "privacy.network.pillClean",
  "privacy.network.pillOne",
  "privacy.network.pillMany",
  "privacy.network.aria",
  "privacy.network.title",
  "privacy.network.cleanTitle",
  "privacy.network.dirtyTitle",
  "privacy.network.explanation",
  "privacy.network.crossOrigin",
  "privacy.network.sameOrigin",
  "privacy.network.active",
  "privacy.network.inactive",
];

describe("locale messages", () => {
  it("keeps the same key set in every locale", () => {
    const englishKeys = Object.keys(MESSAGES.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(englishKeys);
    }
  });

  it("translates the privacy network indicator", () => {
    for (const locale of LOCALES) {
      for (const key of PRIVACY_NETWORK_KEYS) {
        const value = MESSAGES[locale][key as keyof typeof MESSAGES.en];
        expect(value, `${locale} ${key}`).toBeTruthy();
      }
    }
  });
});
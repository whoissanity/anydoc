"use client";

import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";

/**
 * Route-level boundary for /editor. Catches a render throw anywhere in the shell
 * (including a parser/loader throw that escapes a handler) and offers a way out
 * instead of Next.js's default white screen.
 */
export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  return (
    <main
      role="alert"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        backgroundColor: "#000000",
        color: "rgba(255, 255, 255, 0.87)",
<<<<<<< HEAD
        fontFamily: "'Host Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
=======
        fontFamily: "'Libre Franklin', -apple-system, BlinkMacSystemFont, sans-serif",
>>>>>>> origin/v0/anydoc-design-system
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          padding: "22px 24px",
          borderRadius: 14,
          backgroundColor: "#141414",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <strong style={{ fontSize: 15 }}>{t("editor.errorTitle")}</strong>
        <span style={{ fontSize: 12, lineHeight: 1.55, color: "rgba(255, 255, 255, 0.62)" }}>
          {t("editor.errorBody")}
        </span>
        <pre
          style={{
            margin: 0,
            maxHeight: 160,
            overflow: "auto",
            padding: 10,
            borderRadius: 8,
            backgroundColor: "#0d0d0d",
            color: "rgba(255, 255, 255, 0.55)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message || String(error)}
        </pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={reset} style={primaryButton}>
            {t("editor.tryAgain")}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={secondaryButton}
          >
            {t("editor.reloadApp")}
          </button>
          <Link href="/" style={secondaryLink}>
            {t("legal.back")}
          </Link>
        </div>
      </div>
    </main>
  );
}

const primaryButton = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #0A84FF",
  backgroundColor: "#0A84FF",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const secondaryButton = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.18)",
  backgroundColor: "transparent",
  color: "rgba(255, 255, 255, 0.87)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
} as const;

const secondaryLink = {
  ...secondaryButton,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
<<<<<<< HEAD
} as const;
=======
} as const;
>>>>>>> origin/v0/anydoc-design-system

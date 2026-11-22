import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        backgroundColor: "var(--c-bg)",
        color: "var(--c-text)",
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          padding: 24,
          borderRadius: "var(--radius-card)",
          backgroundColor: "var(--c-bg-varied-1)",
          boxShadow: "var(--shadow-raised-sm)",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 750, margin: 0 }}>Page not found</h1>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--c-text-muted)" }}>
          The page you asked for does not exist. Documents stay on this device; only the
          address was wrong.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 8,
            padding: "9px 14px",
            borderRadius: 999,
            backgroundColor: "var(--c-accent, #2f6feb)",
            color: "var(--c-on-accent, #fff)",
            fontSize: 13,
            fontWeight: 650,
            textDecoration: "none",
          }}
        >
          Back to AnyDoc
        </Link>
      </div>
    </main>
  );
}
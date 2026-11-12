"use client";

import dynamic from "next/dynamic";

const EditorShell = dynamic(
  () => import("@/components/editor/EditorShell").then((m) => m.EditorShell),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          backgroundColor: "#000000",
          color: "rgba(255, 255, 255, 0.87)",
          fontFamily: "'Host Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 600,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 16,
              height: 16,
              border: "2px solid rgba(255, 255, 255, 0.2)",
              borderTopColor: "#0A84FF",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span>Loading AnyDoc…</span>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return <EditorShell />;
}

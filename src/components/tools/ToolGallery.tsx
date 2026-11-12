"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useEditorStore } from "@/store/editor-store";
import { TOOL_CATEGORIES, TOOLS, type ToolCategory } from "@/lib/tools/catalog";

export function ToolGallery() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ToolCategory | "All">("All");
  const setActiveDialog = useEditorStore((s) => s.setActiveDialog);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const toggleTool = useEditorStore((s) => s.toggleTool);
  const setCurrentView = useEditorStore((s) => s.setCurrentView);
  const hasDoc = !!useEditorStore((s) => s.pdfBytes);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((tool) => {
      if (tool.unavailable) return false;
      if (category !== "All" && tool.category !== category) return false;
      if (!q) return true;
      return (
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.keywords.some((k) => k.includes(q))
      );
    });
  }, [query, category]);

  const unavailable = TOOLS.filter((tool) => !!tool.unavailable);

  const open = (toolId: string, opensDialog?: "redact" | "bates") => {
    if (opensDialog) {
      setActiveDialog(opensDialog);
      return;
    }
    setActiveTool(toolId);
    setActiveDialog("tool");
  };

  return (
    <section
      style={{
        padding: "22px",
        borderRadius: "var(--radius-card)",
        backgroundColor: "var(--c-bg-varied-1)",
        boxShadow: "var(--shadow-raised-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--c-text)" }}>
            All document tools
          </div>
          <div style={{ fontSize: 11.5, color: "var(--c-text-muted)", marginTop: 2 }}>
            {TOOLS.filter((t) => !t.unavailable).length} tools — searchable and grouped, like a real
            workbench
          </div>
        </div>

        <div style={{ position: "relative", flex: "0 1 260px", minWidth: 180 }}>
          <Search
            size={13}
            strokeWidth={1.6}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--c-text-subtle)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={query}
            placeholder="Search tools…"
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              height: 30,
              padding: "0 10px 0 30px",
              borderRadius: "var(--radius-btn)",
              border: "none",
              backgroundColor: "var(--c-surface-sunken)",
              color: "var(--c-text)",
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {(["All", ...TOOL_CATEGORIES] as Array<ToolCategory | "All">).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: "var(--radius-btn)",
              backgroundColor:
                category === cat ? "var(--c-btn-bg)" : "var(--c-surface-sunken)",
              color: category === cat ? "var(--c-btn-text)" : "var(--c-text-muted)",
              transition: "all 120ms ease",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))",
          gap: 10,
        }}
      >
        {shown.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              className="card-raised"
              disabled={!hasDoc}
              onClick={() => {
                if (tool.activateTool) {
                  toggleTool(tool.activateTool);
                  setCurrentView("viewer");
                  return;
                }
                open(tool.id, tool.opensDialog);
              }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "12px 13px",
                borderRadius: "var(--radius-soft)",
                backgroundColor: "var(--c-surface-raised)",
                border: "1px solid var(--c-border-subtle)",
                boxShadow: "var(--shadow-raised-sm)",
                textAlign: "left",
                opacity: hasDoc ? 1 : 0.45,
                cursor: hasDoc ? "pointer" : "not-allowed",
                transition: "transform 130ms ease, box-shadow 130ms ease",
              }}
              onMouseEnter={(e) => {
                if (!hasDoc) return;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "var(--shadow-raised)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "var(--shadow-raised-sm)";
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor: "var(--c-surface-elevated)",
                  boxShadow: "var(--shadow-raised-sm)",
                  flexShrink: 0,
                }}
              >
                <Icon size={15} strokeWidth={1.7} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--c-text)" }}>
                  {tool.name}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--c-text-muted)",
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {tool.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {!shown.length && (
        <div style={{ fontSize: 12, color: "var(--c-text-muted)", padding: "12px 2px" }}>
          No tool matches “{query}”.
        </div>
      )}

      {!!unavailable.length && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--c-border-subtle)", paddingTop: 12 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--c-text-subtle)",
              marginBottom: 8,
            }}
          >
            Needs the desktop engine
          </div>
          {unavailable.map((tool) => (
            <div
              key={tool.id}
              style={{
                display: "flex",
                gap: 8,
                fontSize: 11.5,
                color: "var(--c-text-subtle)",
                padding: "3px 0",
                lineHeight: 1.45,
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--c-text-muted)" }}>{tool.name}</span>
              <span>— {tool.unavailable}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

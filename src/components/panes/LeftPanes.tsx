"use client";

import { useEffect, useState } from "react";
import { useEditorStore } from "@/store/editor-store";
import { withRenderLock } from "@/lib/document/render-queue";
import { reorderPages } from "@/lib/document/pages";
import { reloadFromBytes } from "@/lib/document/document-service";
import { downloadBlob } from "@/lib/document/load";
import { exportCommentsToFdf, type CommentThread } from "@/lib/security/pdf-security";
import { X, Download } from "lucide-react";

export function LeftPanes() {
  const leftPane = useEditorStore((s) => s.leftPane);
  const setLeftPane = useEditorStore((s) => s.setLeftPane);
  const pageCount = useEditorStore((s) => s.pageCount);
  const currentPage = useEditorStore((s) => s.currentPage);
  const outline = useEditorStore((s) => s.outline);
  const attachments = useEditorStore((s) => s.attachments);
  const layers = useEditorStore((s) => s.layers);
  const comments = useEditorStore((s) => s.comments);
  const addComment = useEditorStore((s) => s.addComment);
  const updateCommentStatus = useEditorStore((s) => s.updateCommentStatus);
  const addCommentReply = useEditorStore((s) => s.addCommentReply);
  const pdfDocProxy = useEditorStore((s) => s.pdfDocProxy);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const toggleLayer = useEditorStore((s) => s.toggleLayer);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>("All");

  useEffect(() => {
    if (leftPane !== "thumbnails" || !pdfDocProxy || !pageCount) return;
    let cancelled = false;
    async function build() {
      const doc = pdfDocProxy as {
        getPage: (n: number) => Promise<{
          getViewport: (o: { scale: number }) => { width: number; height: number };
          render: (o: unknown) => { promise: Promise<void> };
        }>;
      };
      const next: Record<number, string> = {};
      for (let i = 1; i <= pageCount; i++) {
        if (cancelled) return;
        try {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 0.22 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await withRenderLock(() => page.render({ canvasContext: ctx, viewport }).promise);
          next[i] = canvas.toDataURL("image/jpeg", 0.7);
          if (i % 4 === 0) setThumbs({ ...next });
        } catch {
          // ignore
        }
      }
      if (!cancelled) setThumbs(next);
    }
    build();
    return () => {
      cancelled = true;
    };
  }, [leftPane, pdfDocProxy, pageCount]);

  if (leftPane === "none" || !pageCount) return null;

  const paneTitle =
    leftPane === "thumbnails"
      ? "Thumbnails"
      : leftPane === "outline"
      ? "Table of Contents"
      : leftPane === "attachments"
      ? "Attachments"
      : leftPane === "comments"
      ? "Comments & Review"
      : "Layers";

  return (
    <aside
      style={{
        width: "var(--pane-w)",
        backgroundColor: "var(--c-surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        boxShadow: "var(--shadow-divider-r)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        zIndex: 25,
      }}
    >
      <div
        style={{
          height: 38,
          padding: "0 14px",
          boxShadow: "var(--shadow-divider-b)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text)" }}>
          {paneTitle}
        </span>
        <button
          type="button"
          onClick={() => setLeftPane("none")}
          title="Close panel"
          style={{
            color: "var(--c-text-muted)",
            display: "grid",
            placeItems: "center",
            padding: 4,
            borderRadius: "var(--radius-btn)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "10px" }}>
        {leftPane === "thumbnails" &&
          Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              draggable
              onDragStart={() => setDragFrom(n)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async () => {
                if (dragFrom == null || dragFrom === n) return;
                const bytes = useEditorStore.getState().pdfBytes;
                if (!bytes) return;
                const order = Array.from({ length: pageCount }, (_, i) => i);
                const from = dragFrom - 1;
                const to = n - 1;
                const [moved] = order.splice(from, 1);
                order.splice(to, 0, moved);
                useEditorStore.getState().setStatus("Reordering pages…");
                const next = await reorderPages(bytes, order);
                await reloadFromBytes(next);
                setDragFrom(null);
              }}
              onClick={() => setCurrentPage(n)}
              style={{
                marginBottom: 10,
                padding: "8px",
                borderRadius: "var(--radius-soft)",
                backgroundColor:
                  currentPage === n ? "var(--c-surface-raised)" : "var(--c-surface-sunken)",
                boxShadow:
                  currentPage === n
                    ? "0 0 0 2px var(--c-btn-bg), var(--shadow-raised)"
                    : "var(--shadow-raised-sm)",
                cursor: "pointer",
                transition: "all 140ms ease",
              }}
            >
              {thumbs[n] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbs[n]}
                  alt={`Page ${n}`}
                  style={{
                    width: "100%",
                    display: "block",
                    borderRadius: 4,
                    boxShadow: "var(--shadow-staged-card)",
                  }}
                />
              ) : (
                <div
                  style={{
                    aspectRatio: "8.5/11",
                    backgroundColor: "var(--c-surface-sunken)",
                    border: "1px solid var(--c-border-subtle)",
                    borderRadius: 4,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--c-text-muted)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Page {n}
                </div>
              )}
              <div
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  marginTop: 6,
                  fontWeight: 600,
                  color: "var(--c-text)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {n}
              </div>
            </div>
          ))}

        {leftPane === "outline" && (
          <OutlineTree
            items={outline}
            onNavigate={(pageIndex) => {
              if (pageIndex != null) setCurrentPage(pageIndex + 1);
            }}
          />
        )}

        {leftPane === "attachments" && (
          <div>
            {!attachments.length && (
              <p style={{ color: "var(--c-text-muted)", fontSize: 12, padding: "8px 4px" }}>
                No embedded attachments.
              </p>
            )}
            {attachments.map((a) => (
              <button
                key={a.filename}
                type="button"
                onClick={() => {
                  if (!a.content) return;
                  downloadBlob(
                    new Blob([a.content.buffer as ArrayBuffer], {
                      type: "application/octet-stream",
                    }),
                    a.filename
                  );
                }}
                className="card-raised"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  backgroundColor: "var(--c-surface-raised)",
                  borderRadius: "var(--radius-soft)",
                  boxShadow: "var(--shadow-raised-sm)",
                  padding: "10px 12px",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text)" }}>
                  {a.filename}
                </div>
                {a.description && (
                  <div style={{ fontSize: 11, color: "var(--c-text-muted)", marginTop: 2 }}>
                    {a.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {leftPane === "layers" && (
          <div>
            {!layers.length && (
              <p style={{ color: "var(--c-text-muted)", fontSize: 12, padding: "8px 4px" }}>
                No layers found in this document.
              </p>
            )}
            {layers.map((l) => (
              <label
                key={l.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 4px",
                  boxShadow: "var(--shadow-divider-b)",
                  fontSize: 12,
                  color: "var(--c-text)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={l.visible}
                  onChange={() => toggleLayer(l.id)}
                />
                {l.name}
              </label>
            ))}
          </div>
        )}

        {leftPane === "comments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
              {["All", "Open", "Accepted", "Rejected"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "var(--radius-btn)",
                    backgroundColor:
                      statusFilter === st ? "var(--c-btn-bg)" : "var(--c-surface-sunken)",
                    color: statusFilter === st ? "var(--c-btn-text)" : "var(--c-text-muted)",
                    border: "none",
                  }}
                >
                  {st}
                </button>
              ))}
            </div>

            <div
              style={{
                backgroundColor: "var(--c-surface-raised)",
                padding: 10,
                borderRadius: "var(--radius-soft)",
                border: "1px solid var(--c-border-subtle)",
              }}
            >
              <textarea
                placeholder="Add sticky review comment on this page…"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                style={{
                  width: "100%",
                  backgroundColor: "var(--c-surface-sunken)",
                  border: "none",
                  borderRadius: "var(--radius-input)",
                  padding: "6px 8px",
                  fontSize: 11,
                  color: "var(--c-text)",
                  resize: "none",
                  height: 48,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "var(--c-text-subtle)", fontFamily: "var(--font-mono)" }}>
                  Page {currentPage}
                </span>
                <button
                  type="button"
                  disabled={!newCommentText.trim()}
                  onClick={() => {
                    addComment({
                      id: `c-${Date.now()}`,
                      author: "Reviewer",
                      date: "Just now",
                      pageIndex: currentPage - 1,
                      text: newCommentText.trim(),
                      type: "sticky",
                      status: "Open",
                      replies: [],
                    });
                    setNewCommentText("");
                  }}
                  className="btn-primary-rounded"
                  style={{ height: 24, padding: "0 10px", fontSize: 11 }}
                >
                  Post Note
                </button>
              </div>
            </div>

            {comments
              .filter((c) => statusFilter === "All" || c.status === statusFilter)
              .map((c) => (
                <div
                  key={c.id}
                  style={{
                    backgroundColor: "var(--c-surface-raised)",
                    borderRadius: "var(--radius-soft)",
                    boxShadow: "var(--shadow-raised-sm)",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--c-text)" }}>
                        {c.author}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(c.pageIndex + 1)}
                        style={{
                          fontSize: 9,
                          fontFamily: "var(--font-mono)",
                          backgroundColor: "var(--c-hover)",
                          padding: "1px 5px",
                          borderRadius: 3,
                          color: "var(--c-text-muted)",
                        }}
                      >
                        P.{c.pageIndex + 1}
                      </button>
                    </div>
                    <select
                      value={c.status}
                      onChange={(e) =>
                        updateCommentStatus(c.id, e.target.value as CommentThread["status"])
                      }
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        backgroundColor:
                          c.status === "Accepted"
                            ? "rgba(48, 209, 88, 0.15)"
                            : c.status === "Rejected"
                            ? "rgba(255, 69, 58, 0.15)"
                            : "var(--c-hover)",
                        color:
                          c.status === "Accepted"
                            ? "var(--c-brand)"
                            : c.status === "Rejected"
                            ? "var(--danger)"
                            : "var(--c-text)",
                        border: "none",
                        borderRadius: 999,
                        padding: "1px 6px",
                        cursor: "pointer",
                      }}
                    >
                      <option value="Open">Open</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--c-text)", lineHeight: 1.4 }}>
                    {c.text}
                  </div>

                  {c.replies.map((r, ri) => (
                    <div
                      key={ri}
                      style={{
                        backgroundColor: "var(--c-surface-sunken)",
                        padding: "6px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        marginLeft: 8,
                        borderLeft: "2px solid var(--c-primary)",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "var(--c-text)" }}>{r.author}: </span>
                      <span style={{ color: "var(--c-text-muted)" }}>{r.text}</span>
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <input
                      placeholder="Reply…"
                      value={replyText[c.id] || ""}
                      onChange={(e) => setReplyText({ ...replyText, [c.id]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && replyText[c.id]?.trim()) {
                          addCommentReply(c.id, {
                            author: "Me",
                            text: replyText[c.id].trim(),
                            date: "Just now",
                          });
                          setReplyText({ ...replyText, [c.id]: "" });
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: "var(--c-surface-sunken)",
                        border: "none",
                        borderRadius: 4,
                        padding: "4px 6px",
                        fontSize: 11,
                        color: "var(--c-text)",
                        outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!replyText[c.id]?.trim()) return;
                        addCommentReply(c.id, {
                          author: "Me",
                          text: replyText[c.id].trim(),
                          date: "Just now",
                        });
                        setReplyText({ ...replyText, [c.id]: "" });
                      }}
                      style={{
                        padding: "0 6px",
                        borderRadius: 4,
                        backgroundColor: "var(--c-btn-bg)",
                        color: "var(--c-btn-text)",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ))}

            {comments.length > 0 && (
              <button
                type="button"
                className="btn-secondary-rounded"
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => {
                  const docName = useEditorStore.getState().fileName || "document.pdf";
                  const fdf = exportCommentsToFdf(comments, docName);
                  downloadBlob(
                    new Blob([fdf], { type: "application/vnd.adobe.xfdf" }),
                    `${docName.replace(/\.pdf$/i, "")}-comments.xfdf`
                  );
                }}
              >
                <Download size={13} strokeWidth={1.85} />
                <span>Export Comments (XFDF)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function OutlineTree({
  items,
  onNavigate,
  depth = 0,
}: {
  items: ReturnType<typeof useEditorStore.getState>["outline"];
  onNavigate: (pageIndex: number | null) => void;
  depth?: number;
}) {
  if (!items.length && depth === 0) {
    return (
      <p style={{ color: "var(--c-text-muted)", fontSize: 12, padding: "8px 4px" }}>
        No bookmarks or outline present.
      </p>
    );
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item, i) => (
        <li key={`${item.title}-${i}`}>
          <button
            type="button"
            onClick={() => onNavigate(item.pageIndex)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              backgroundColor: "transparent",
              border: "none",
              padding: `6px 8px 6px ${8 + depth * 12}px`,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--c-text)",
              borderRadius: "var(--radius-btn)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--c-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            }}
          >
            {item.title}
          </button>
          {item.items?.length > 0 && (
            <OutlineTree items={item.items} onNavigate={onNavigate} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

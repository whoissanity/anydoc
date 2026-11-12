"use client";

import { useEffect, useState } from "react";
import { useEditorStore } from "@/store/editor-store";
import { withRenderLock } from "@/lib/document/render-queue";
import {
  rotatePage,
  deletePages,
  extractPages,
  insertBlankPage,
  reorderPages,
  splitPdf,
} from "@/lib/document/pages";
import { reloadFromBytes } from "@/lib/document/document-service";
import { downloadBlob } from "@/lib/document/load";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  RotateCcw,
  RotateCw,
  Trash2,
  FileOutput,
  Plus,
  Check,
} from "lucide-react";

export default function PageEditorWorkspace() {
  const pageCount = useEditorStore((s) => s.pageCount);
  const pdfDocProxy = useEditorStore((s) => s.pdfDocProxy);
  const pdfBytes = useEditorStore((s) => s.pdfBytes);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const setCurrentView = useEditorStore((s) => s.setCurrentView);
  const setStatus = useEditorStore((s) => s.setStatus);

  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!pdfDocProxy || !pageCount) return;
    let cancelled = false;

    async function loadThumbnails() {
      const doc = pdfDocProxy as {
        getPage: (n: number) => Promise<{
          getViewport: (o: { scale: number }) => { width: number; height: number };
          render: (o: unknown) => { promise: Promise<void> };
        }>;
      };

      const result: Record<number, string> = {};
      for (let i = 1; i <= pageCount; i++) {
        if (cancelled) return;
        try {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 0.25 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await withRenderLock(() => page.render({ canvasContext: ctx, viewport }).promise);
          result[i] = canvas.toDataURL("image/jpeg", 0.75);
          if (i % 3 === 0) setThumbnails({ ...result });
        } catch {
          // ignore error
        }
      }
      if (!cancelled) setThumbnails(result);
    }

    loadThumbnails();
    return () => {
      cancelled = true;
    };
  }, [pdfDocProxy, pageCount]);

  const togglePageSelection = (n: number) => {
    setSelectedPages((prev) =>
      prev.includes(n) ? prev.filter((p) => p !== n) : [...prev, n]
    );
  };

  const handleSelectAll = () => {
    if (selectedPages.length === pageCount) {
      setSelectedPages([]);
    } else {
      setSelectedPages(Array.from({ length: pageCount }, (_, i) => i + 1));
    }
  };

  const handleRotatePage = async (pageNumber: number, direction: "cw" | "ccw") => {
    if (!pdfBytes) return;
    try {
      setStatus(`Rotating page ${pageNumber}…`);
      const angle = direction === "cw" ? 90 : 270;
      const next = await rotatePage(pdfBytes, pageNumber - 1, angle);
      await reloadFromBytes(next);
      setStatus(`Rotated page ${pageNumber}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Rotation failed");
    }
  };

  const handleDeletePage = async (pageNumber: number) => {
    if (!pdfBytes) return;
    if (pageCount <= 1) {
      setStatus("Cannot delete the only page in the document");
      return;
    }
    try {
      setStatus(`Deleting page ${pageNumber}…`);
      const next = await deletePages(pdfBytes, [pageNumber - 1]);
      await reloadFromBytes(next);
      setSelectedPages((prev) => prev.filter((p) => p !== pageNumber));
      setStatus(`Deleted page ${pageNumber}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleDeleteSelected = async () => {
    if (!pdfBytes || selectedPages.length === 0) return;
    if (selectedPages.length >= pageCount) {
      setStatus("Cannot delete all pages");
      return;
    }
    try {
      setStatus(`Deleting ${selectedPages.length} pages…`);
      const indices = selectedPages.map((p) => p - 1);
      const next = await deletePages(pdfBytes, indices);
      await reloadFromBytes(next);
      setSelectedPages([]);
      setStatus(`Deleted ${selectedPages.length} pages`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleExtractPage = async (pageNumber: number) => {
    if (!pdfBytes) return;
    try {
      setStatus(`Extracting page ${pageNumber}…`);
      const next = await extractPages(pdfBytes, [pageNumber - 1]);
      downloadBlob(
        new Blob([next.buffer as ArrayBuffer], { type: "application/pdf" }),
        `page-${pageNumber}.pdf`
      );
      setStatus(`Extracted page ${pageNumber}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Extraction failed");
    }
  };

  const handleExtractSelected = async () => {
    if (!pdfBytes || selectedPages.length === 0) return;
    try {
      setStatus(`Extracting ${selectedPages.length} pages…`);
      const indices = selectedPages.map((p) => p - 1);
      const next = await extractPages(pdfBytes, indices);
      downloadBlob(
        new Blob([next.buffer as ArrayBuffer], { type: "application/pdf" }),
        `extracted-${selectedPages.join("-")}.pdf`
      );
      setStatus(`Extracted ${selectedPages.length} pages`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Extraction failed");
    }
  };

  const handleInsertBlank = async (afterPageNumber: number) => {
    if (!pdfBytes) return;
    try {
      setStatus(`Inserting blank page after page ${afterPageNumber}…`);
      const next = await insertBlankPage(pdfBytes, afterPageNumber);
      await reloadFromBytes(next);
      setStatus(`Inserted blank page`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Insert failed");
    }
  };

  const handleDropReorder = async (targetPage: number) => {
    if (dragIndex === null || dragIndex === targetPage || !pdfBytes) return;
    try {
      setStatus(`Moving page ${dragIndex} to position ${targetPage}…`);
      const order = Array.from({ length: pageCount }, (_, i) => i);
      const [removed] = order.splice(dragIndex - 1, 1);
      order.splice(targetPage - 1, 0, removed);
      const next = await reorderPages(pdfBytes, order);
      await reloadFromBytes(next);
      setStatus(`Moved page ${dragIndex} to position ${targetPage}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Reorder failed");
    } finally {
      setDragIndex(null);
      setDragOverIndex(null);
    }
  };

  const handleSplitPdf = async () => {
    if (!pdfBytes) return;
    try {
      setStatus("Splitting document into single-page PDFs…");
      const parts = await splitPdf(pdfBytes);
      const zip = new JSZip();
      parts.forEach((p) => zip.file(p.name, p.bytes));
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "split-pages.zip");
      setStatus(`Split into ${parts.length} files`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Split failed");
    }
  };

  if (!pageCount) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--c-text-muted)",
        }}
      >
        No document loaded
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--c-bg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 40,
          backgroundColor: "var(--c-surface)",
          boxShadow: "var(--shadow-divider-b)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={handleSelectAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--c-text)",
              padding: "4px 12px",
              borderRadius: "var(--radius-btn)",
              backgroundColor: "var(--c-surface-raised)",
              boxShadow: "var(--shadow-raised-sm)",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                border: "1.5px solid var(--c-btn-bg)",
                backgroundColor:
                  selectedPages.length === pageCount ? "var(--c-btn-bg)" : "transparent",
                display: "grid",
                placeItems: "center",
                color: "#ffffff",
              }}
            >
              {selectedPages.length === pageCount && <Check size={10} strokeWidth={2.5} />}
            </div>
            <span>
              {selectedPages.length > 0
                ? `${selectedPages.length} selected`
                : `Select all (${pageCount})`}
            </span>
          </button>

          {selectedPages.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExtractSelected}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--c-text)",
                  padding: "4px 12px",
                  borderRadius: "var(--radius-btn)",
                  backgroundColor: "var(--c-surface-raised)",
                  boxShadow: "var(--shadow-raised-sm)",
                }}
              >
                <FileOutput size={14} strokeWidth={1.5} />
                <span>Extract selected</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteSelected}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--danger)",
                  padding: "4px 12px",
                  borderRadius: "var(--radius-btn)",
                  backgroundColor: "var(--c-surface-raised)",
                  boxShadow: "var(--shadow-raised-sm)",
                }}
              >
                <Trash2 size={14} strokeWidth={1.5} />
                <span>Delete selected</span>
              </button>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => handleInsertBlank(pageCount)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--c-text)",
              padding: "4px 12px",
              borderRadius: "var(--radius-btn)",
              backgroundColor: "var(--c-surface-raised)",
              boxShadow: "var(--shadow-raised-sm)",
            }}
          >
            <Plus size={14} strokeWidth={1.5} />
            <span>Add page at end</span>
          </button>

          <button
            type="button"
            onClick={handleSplitPdf}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--c-text)",
              padding: "4px 12px",
              borderRadius: "var(--radius-btn)",
              backgroundColor: "var(--c-surface-raised)",
              boxShadow: "var(--shadow-raised-sm)",
            }}
          >
            <FileOutput size={14} strokeWidth={1.5} />
            <span>Split all</span>
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "28px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
          gap: 24,
          alignContent: "start",
        }}
      >
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
          const isSelected = selectedPages.includes(n);
          const isDragging = dragIndex === n;
          const isOver = dragOverIndex === n;

          return (
            <div
              key={n}
              draggable
              onDragStart={() => setDragIndex(n)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverIndex(n);
              }}
              onDragLeave={() => {
                if (dragOverIndex === n) setDragOverIndex(null);
              }}
              onDrop={() => handleDropReorder(n)}
              className="card-raised"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                backgroundColor: "var(--c-surface-raised)",
                borderRadius: "var(--radius-card)",
                padding: "12px",
                gap: 10,
                opacity: isDragging ? 0.4 : 1,
                boxShadow: isSelected
                  ? "0 0 0 2px var(--c-btn-bg), var(--shadow-raised-lg)"
                  : isOver
                  ? "0 0 0 2px var(--c-btn-bg), var(--shadow-raised)"
                  : "var(--shadow-raised)",
                transition: "all 140ms ease",
                cursor: "grab",
              }}
            >
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePageSelection(n);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: "1.5px solid var(--c-btn-bg)",
                    backgroundColor: isSelected ? "var(--c-btn-bg)" : "transparent",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    color: "#ffffff",
                  }}
                >
                  {isSelected && <Check size={12} strokeWidth={2.5} />}
                </div>

                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--c-text)",
                  }}
                >
                  {n} / {pageCount}
                </span>
              </div>

              <div
                onClick={() => {
                  setCurrentPage(n);
                  setCurrentView("viewer");
                }}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1.35",
                  backgroundColor: "var(--c-surface-sunken)",
                  border: "1px solid var(--c-border-subtle)",
                  borderRadius: 6,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "var(--shadow-staged-card)",
                  cursor: "pointer",
                  transition: "transform 140ms ease, box-shadow 140ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.02)";
                  e.currentTarget.style.boxShadow = "var(--shadow-staged-doc)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "var(--shadow-staged-card)";
                }}
              >
                {thumbnails[n] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnails[n]}
                    alt={`Page ${n}`}
                    style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#ffffff" }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--c-text-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Page {n}
                  </span>
                )}
              </div>

              <div
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  paddingTop: 6,
                }}
              >
                <button
                  type="button"
                  title="Rotate Left 90°"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRotatePage(n, "ccw");
                  }}
                  style={{
                    padding: 5,
                    borderRadius: "var(--radius-btn)",
                    color: "var(--c-text-muted)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
                >
                  <RotateCcw size={15} strokeWidth={1.5} />
                </button>

                <button
                  type="button"
                  title="Rotate Right 90°"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRotatePage(n, "cw");
                  }}
                  style={{
                    padding: 5,
                    borderRadius: "var(--radius-btn)",
                    color: "var(--c-text-muted)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
                >
                  <RotateCw size={15} strokeWidth={1.5} />
                </button>

                <button
                  type="button"
                  title="Extract page"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleExtractPage(n);
                  }}
                  style={{
                    padding: 5,
                    borderRadius: "var(--radius-btn)",
                    color: "var(--c-text-muted)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
                >
                  <FileOutput size={15} strokeWidth={1.5} />
                </button>

                <button
                  type="button"
                  title="Insert blank after"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleInsertBlank(n);
                  }}
                  style={{
                    padding: 5,
                    borderRadius: "var(--radius-btn)",
                    color: "var(--c-text-muted)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
                >
                  <Plus size={15} strokeWidth={1.5} />
                </button>

                <button
                  type="button"
                  title="Delete page"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeletePage(n);
                  }}
                  style={{
                    padding: 5,
                    borderRadius: "var(--radius-btn)",
                    color: "var(--c-text-muted)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-muted)")}
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

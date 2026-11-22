// DEV-ONLY: component interaction tests for the text-edit overlay.
// Not mirrored to anydoc/ (deployment tree).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEditorStore } from "@/store/editor-store";
import { PdfPage } from "@/components/viewer/PdfPage";
import type { TextEditSession } from "@/lib/types";

// The page rendering pipeline (PDF.js + canvas) is irrelevant to keyboard behavior and
// can't run in jsdom anyway, so it is stubbed out.
vi.mock("@/lib/document/render-queue", () => ({
  withRenderLock: <T,>(task: () => Promise<T>) => task(),
  renderPageWithTimeout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/document/document-service", () => ({
  reloadFromBytes: vi.fn(),
}));
vi.mock("@/lib/edit/edit-engine", () => ({
  applyTextEdit: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

function session(over: Partial<TextEditSession> = {}): TextEditSession {
  return {
    id: "sess-1",
    pageIndex: 0,
    text: "Hello",
    x: 10,
    y: 10,
    width: 160,
    height: 20,
    fontSize: 12,
    fontFamily: "Helvetica, Arial, sans-serif",
    color: "#111111",
    lineHeight: 1.25,
    ...over,
  };
}

beforeEach(() => {
  useEditorStore.setState({
    tool: "text-edit",
    textEdit: null,
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    pdfDocProxy: null,
    currentPage: 1,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubCanvas() {
  const context = {
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(width, 1) * Math.max(height, 1) * 4),
    }),
    fillRect: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D
  );
}

describe("text-edit block selection", () => {
  it("opens a multi-line paragraph with its source size, family and leading", async () => {
    stubCanvas();
    useEditorStore.setState({
      tool: "text-edit",
      pdfDocProxy: {
        getPage: async () => ({
          getViewport: () => ({ width: 612, height: 800 }),
          render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
          getTextContent: async () => ({
            items: [
              {
                str: "The quick brown fox",
                transform: [12, 0, 0, 12, 72, 700],
                width: 120,
                height: 12,
                fontName: "g_d0_f1",
              },
              {
                str: "jumps over the lazy dog.",
                transform: [12, 0, 0, 12, 72, 684],
                width: 140,
                height: 12,
                fontName: "g_d0_f1",
              },
            ],
          }),
        }),
      },
    });
    const { container } = render(<PdfPage pageNumber={1} scale={1} />);

    await waitFor(() => {
      expect(container.querySelectorAll(".pdf-text-layer span")).toHaveLength(2);
    });

    const spans = container.querySelectorAll<HTMLElement>(".pdf-text-layer span");
    fireEvent.click(spans[0]);

    const session = useEditorStore.getState().textEdit;
    expect(session).not.toBeNull();
    expect(session!.text).toBe("The quick brown fox\njumps over the lazy dog.");
    expect(session!.fontSize).toBe(12);
    expect(session!.lineHeight).toBeCloseTo(1.333, 2);
    expect(session!.x).toBe(72);
    expect(session!.width).toBe(140);
    // Both spans are hidden while the block editor is open.
    expect(spans[0].style.opacity).toBe("0");
    expect(spans[1].style.opacity).toBe("0");
  });
});

describe("text-edit keyboard behavior", () => {
  it("commits the text on Enter", () => {
    useEditorStore.setState({ textEdit: session() });
    render(<PdfPage pageNumber={1} scale={1} />);

    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(ta, { key: "Enter" });

    expect(useEditorStore.getState().textEdit).toBeNull();
  });

  it("inserts a newline on Shift+Enter instead of committing", () => {
    useEditorStore.setState({ textEdit: session() });
    render(<PdfPage pageNumber={1} scale={1} />);

    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });

    // Session stays open; the textarea keeps its value (a newline may be inserted by the
    // browser's default action, which we deliberately do not prevent for Shift+Enter).
    expect(useEditorStore.getState().textEdit).not.toBeNull();
  });

  it("commits the text on blur (click-away)", () => {
    useEditorStore.setState({ textEdit: session() });
    render(<PdfPage pageNumber={1} scale={1} />);

    const ta = screen.getByRole("textbox");
    fireEvent.blur(ta);

    expect(useEditorStore.getState().textEdit).toBeNull();
  });

  it("does not commit an empty brand-new text box on blur", () => {
    useEditorStore.setState({ textEdit: session({ text: "", eraseUnderlay: false }) });
    render(<PdfPage pageNumber={1} scale={1} />);

    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "   " } });
    fireEvent.blur(ta);

    // An empty new box is dropped without baking, so the session just closes.
    expect(useEditorStore.getState().textEdit).toBeNull();
  });
});

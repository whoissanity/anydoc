import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useEditorStore } from "@/store/editor-store";
import { ReflowView } from "@/components/viewer/ReflowView";

class ImmediateObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never);
  }
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useEditorStore.setState({ pdfDocProxy: null, pageCount: 0 });
});

describe("ReflowView", () => {
  it("renders extracted PDF text as selectable text", async () => {
    vi.stubGlobal("IntersectionObserver", ImmediateObserver);
    useEditorStore.setState({
      pageCount: 1,
      pdfDocProxy: {
        getPage: async () => ({
          getTextContent: async () => ({
            items: [{ str: "Hello" }, { str: "world" }],
          }),
        }),
      },
    });

    render(<ReflowView />);

    expect(await screen.findByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText(/Text only/)).toBeInTheDocument();
  });
});
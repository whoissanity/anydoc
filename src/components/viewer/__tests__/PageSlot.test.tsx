// DEV-ONLY: virtualization contract for a page slot.
// Not mirrored to anydoc/ (deployment tree).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/viewer/PdfPage", () => ({
  PdfPage: () => <div data-testid="pdf-page" />,
}));

import { PageSlot } from "@/components/viewer/PdfViewer";

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal(
    "IntersectionObserver",
    MockIntersectionObserver as unknown as typeof IntersectionObserver
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PageSlot", () => {
  it("keeps a placeholder and reports visibility to the parent", () => {
    const onVisibility = vi.fn();
    render(
      <PageSlot
        pageNumber={7}
        scale={1}
        estimateW={100}
        estimateH={140}
        mounted={false}
        onVisibility={onVisibility}
        onMeasure={vi.fn()}
      />
    );

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-page")).toBeNull();

    const observer = MockIntersectionObserver.instances.at(-1)!;
    observer.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver
    );
    expect(onVisibility).toHaveBeenCalledWith(7, true);
  });

  it("mounts the real page when the slot is near the viewport", () => {
    render(
      <PageSlot
        pageNumber={3}
        scale={1}
        estimateW={100}
        estimateH={140}
        mounted
        onVisibility={vi.fn()}
        onMeasure={vi.fn()}
      />
    );

    expect(screen.getByTestId("pdf-page")).toBeInTheDocument();
    expect(screen.queryByText("3")).toBeNull();
  });
});
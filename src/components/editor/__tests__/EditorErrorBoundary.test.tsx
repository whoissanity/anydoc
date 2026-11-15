// DEV-ONLY: crash containment for the editor subtree.
// Not mirrored to anydoc/ (deployment tree).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditorErrorBoundary } from "@/components/editor/EditorErrorBoundary";

vi.mock("@/components/providers/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

/** Throws during render, which is what the boundary must contain. */
function Boom(): never {
  throw new Error("parser exploded");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EditorErrorBoundary", () => {
  it("replaces the subtree with a readable crash panel", () => {
    render(
      <EditorErrorBoundary>
        <Boom />
      </EditorErrorBoundary>
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("editor.errorTitle");
    expect(alert.textContent).toContain("parser exploded");
    expect(screen.getByText("editor.tryAgain")).toBeInTheDocument();
    expect(screen.getByText("editor.closeDocument")).toBeInTheDocument();
  });

  it("returns to the children after Try again", () => {
    const { rerender } = render(
      <EditorErrorBoundary>
        <Boom />
      </EditorErrorBoundary>
    );
    // The same broken child would immediately re-throw; swap in a healthy subtree first.
    rerender(
      <EditorErrorBoundary>
        <div>recovered</div>
      </EditorErrorBoundary>
    );
    fireEvent.click(screen.getByText("editor.tryAgain"));

    expect(screen.getByText("recovered")).toBeInTheDocument();
  });
});
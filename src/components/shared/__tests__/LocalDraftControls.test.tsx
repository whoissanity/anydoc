import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocalDraftControls } from "@/components/shared/LocalDraftControls";
import { clearDraft, saveDraft, type DraftSnapshot } from "@/lib/storage/draft-store";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function snapshot(): DraftSnapshot {
  return {
    fileName: "contract.pdf",
    pdfBytes: PDF_BYTES,
    savedAt: Date.now(),
    annotations: [],
    stickyNotes: [],
    formFields: [],
    ocrPages: [],
    images: [],
    redactions: [],
    comments: [],
    textObjects: [],
    dirty: true,
  };
}

beforeEach(async () => {
  await clearDraft();
});

afterEach(() => {
  cleanup();
});

describe("LocalDraftControls", () => {
  it("states plainly that the draft is unencrypted by default", async () => {
    render(<LocalDraftControls />);
    await userEvent.click(screen.getByRole("button", { name: "Local draft" }));

    expect(
      await screen.findByText("Stored unencrypted in this browser")
    ).toBeInTheDocument();
    expect(screen.getByText("Passphrase encryption")).toBeInTheDocument();
  });

  it("enables delete now only when a draft exists", async () => {
    render(<LocalDraftControls />);
    await userEvent.click(screen.getByRole("button", { name: "Local draft" }));
    expect(await screen.findByRole("button", { name: "Delete now" })).toBeDisabled();

    await saveDraft(snapshot());
    await userEvent.click(screen.getByRole("button", { name: "Local draft" }));
    await userEvent.click(screen.getByRole("button", { name: "Local draft" }));
    expect(await screen.findByRole("button", { name: "Delete now" })).toBeEnabled();
  });
});
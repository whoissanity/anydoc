import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/store/editor-store";

function setDocument(overrides: Partial<ReturnType<typeof useEditorStore.getState>> = {}) {
  useEditorStore.setState({
    pdfBytes: new Uint8Array([1, 2, 3]),
    fileName: "test.pdf",
    pageCount: 2,
    currentPage: 1,
    annotations: [],
    stickyNotes: [],
    comments: [],
    formFields: [],
    ocrPages: [],
    images: [],
    redactions: [],
    textObjects: [],
    history: [],
    historyIndex: -1,
    ...overrides,
  });
}

describe("edit journal", () => {
  beforeEach(() => setDocument());

  it("records snapshots and truncates redo entries", () => {
    const state = useEditorStore.getState();
    state.pushHistory("A");
    useEditorStore.setState({ pdfBytes: new Uint8Array([4]) });
    state.pushHistory("B");
    expect(useEditorStore.getState().history.map((entry) => entry.label)).toEqual(["A", "B"]);

    useEditorStore.setState({ historyIndex: 0 });
    useEditorStore.setState({ pdfBytes: new Uint8Array([5]) });
    state.pushHistory("C");
    expect(useEditorStore.getState().history.map((entry) => entry.label)).toEqual(["A", "C"]);
    expect(useEditorStore.getState().historyIndex).toBe(1);
  });

  it("caps the journal at 20 entries", () => {
    const state = useEditorStore.getState();
    for (let index = 0; index < 25; index += 1) {
      state.pushHistory(`edit ${index}`);
    }
    expect(useEditorStore.getState().history).toHaveLength(20);
    expect(useEditorStore.getState().historyIndex).toBe(19);
  });

  it("clears history for a new document", () => {
    useEditorStore.getState().pushHistory("before");
    useEditorStore.getState().setPdf({
      fileName: "new.pdf",
      bytes: new Uint8Array([9]),
      pageCount: 1,
      proxy: null,
    });
    expect(useEditorStore.getState().history).toHaveLength(0);
    expect(useEditorStore.getState().historyIndex).toBe(-1);
  });
});
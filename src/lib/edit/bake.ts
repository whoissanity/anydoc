import { useEditorStore } from "@/store/editor-store";
import { applyAnnotationsToPdf } from "@/lib/edit/annotate";
import { applyImageEdits, applyTextObjects, imageNeedsBake } from "@/lib/edit/edit-engine";
import { embedFormFields } from "@/lib/edit/forms";
import { applyBatesNumbering } from "@/lib/document/pages";
import { writeCommentsToPdf } from "@/lib/security/pdf-security";
import { redactPdf } from "@/lib/document/optimize";
import { isDetachedBytes } from "@/lib/document/validate";

type EditorSnapshot = ReturnType<typeof useEditorStore.getState>;

export interface BakeOptions {
  /** Burn pending redactions before baking overlays (used before geometry-changing tools). */
  burnRedactions?: boolean;
}

/** Bakes unsaved editor edits (images, markup, forms, Bates) into the bytes without mutating state. */
export async function bakePendingEdits(
  bytes: Uint8Array,
  state: EditorSnapshot,
  options: BakeOptions = {}
): Promise<Uint8Array> {
  if (isDetachedBytes(bytes)) {
    throw new Error("The document bytes are unavailable — reopen the file");
  }
  let next = bytes;

  if (options.burnRedactions && state.redactions.length) {
    const result = await redactPdf(
      next,
      state.redactions.map(({ pageIndex, x, y, width, height }) => ({
        pageIndex,
        x,
        y,
        width,
        height,
      })),
      { dpi: 300, padding: 0, stripMetadata: true }
    );
    next = result.bytes;
  }

  if (state.images.some(imageNeedsBake)) {
    next = await applyImageEdits(next, state.images);
  }
  if (state.annotations.length || state.stickyNotes.length) {
    next = await applyAnnotationsToPdf(next, state.annotations, state.stickyNotes, {
      opacity: state.markupOpacity,
    });
  }
  if (state.textObjects.length) {
    next = await applyTextObjects(next, state.textObjects);
  }
  if (state.formFields.length) {
    next = await embedFormFields(next, state.formFields);
  }
  // Comments are PDF text notes; rewrite our own notes so deletions and replies survive.
  if (state.comments.length > 0 || state.dirty) {
    next = await writeCommentsToPdf(next, state.comments);
  }
  if (state.bates.enabled) {
    next = await applyBatesNumbering(next, state.bates);
  }
  return next;
}
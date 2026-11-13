import {
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  type PDFField,
} from "pdf-lib";
import type { FormFieldDraft } from "@/lib/types";
import { loadPdfLib, savePdfBytes } from "@/lib/document/pages";
import { newId } from "@/lib/id";

export type PdfFieldKind = "checkbox" | "radio" | "dropdown" | "list" | "text" | "unknown";

/** Field type by class identity: bundlers rewrite `constructor.name`, so it must not gate form logic. */
export function pdfFieldKind(field: PDFField): PdfFieldKind {
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "list";
  if (field instanceof PDFTextField) return "text";
  return "unknown";
}

export async function embedFormFields(
  bytes: Uint8Array,
  fields: FormFieldDraft[]
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const f of fields) {
    const page = doc.getPage(f.pageIndex);
    const { height } = page.getSize();
    const y = height - f.y - f.height;
    const name = f.name || `${f.type}_${f.id}`;

    try {
      switch (f.type) {
        case "text": {
          const field = form.createTextField(name);
          field.addToPage(page, { x: f.x, y, width: f.width, height: f.height });
          field.setText(f.value || "");
          field.setFontSize(11);
          field.updateAppearances(font);
          break;
        }
        case "checkbox": {
          const field = form.createCheckBox(name);
          field.addToPage(page, { x: f.x, y, width: f.width, height: f.height });
          if (f.checked) field.check();
          else field.uncheck();
          break;
        }
        case "radio": {
          const field = form.createRadioGroup(name);
          field.addOptionToPage(f.value || "Yes", page, {
            x: f.x,
            y,
            width: f.width,
            height: f.height,
          });
          break;
        }
        case "dropdown": {
          const field = form.createDropdown(name);
          field.addOptions(f.options?.length ? f.options : ["Option 1", "Option 2"]);
          field.addToPage(page, { x: f.x, y, width: f.width, height: f.height });
          if (f.value) field.select(f.value);
          field.updateAppearances(font);
          break;
        }
        case "signature":
        case "submit": {
          const field = form.createTextField(name);
          field.addToPage(page, { x: f.x, y, width: f.width, height: f.height });
          field.setText(f.type === "signature" ? "" : "Submit");
          field.updateAppearances(font);
          page.drawRectangle({
            x: f.x,
            y,
            width: f.width,
            height: f.height,
            borderColor: rgb(0.2, 0.4, 0.8),
            borderWidth: 1,
          });
          break;
        }
      }
    } catch (error) {
      // pdf-lib rejects duplicate field names; anything else is a real failure.
      if (!(error instanceof Error) || !/already exists/i.test(error.message)) throw error;
    }
  }

  return savePdfBytes(doc);
}

export async function readExistingFormFields(bytes: Uint8Array): Promise<FormFieldDraft[]> {
  const doc = await loadPdfLib(bytes);
  const form = doc.getForm();
  const fields = form.getFields();
  const drafts: FormFieldDraft[] = [];

  fields.forEach((field: PDFField, idx) => {
    const name = field.getName();
    const acro = field.acroField;
    const widgets = acro.getWidgets();
    widgets.forEach((widget, wIdx) => {
      const rect = widget.getRectangle();
      const pageRef = widget.dict.get(PDFName.of("P"));
      let pageIndex = 0;
      if (pageRef) {
        const pages = doc.getPages();
        const found = pages.findIndex((p) => p.ref === pageRef);
        if (found >= 0) pageIndex = found;
      }
      const { height } = doc.getPage(pageIndex).getSize();
      const kind = pdfFieldKind(field);
      let type: FormFieldDraft["type"] = "text";
      if (kind === "checkbox") type = "checkbox";
      else if (kind === "radio") type = "radio";
      else if (kind === "dropdown" || kind === "list") type = "dropdown";

      drafts.push({
        id: `existing-${idx}-${wIdx}`,
        name,
        type,
        pageIndex,
        x: rect.x,
        y: height - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
      });
    });
  });

  return drafts;
}

/** Heuristic auto-detect: scan for horizontal underlines / empty rectangles via rendered canvas edges */
export function autoDetectFieldsFromCanvas(
  canvas: HTMLCanvasElement,
  pageIndex: number
): FormFieldDraft[] {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const fields: FormFieldDraft[] = [];
  const rowDark = new Float32Array(height);

  for (let y = 0; y < height; y++) {
    let dark = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum < 80) dark++;
    }
    rowDark[y] = dark / width;
  }

  // Find thin dark horizontal lines spanning ~20–70% width as form underlines
  for (let y = 2; y < height - 2; y++) {
    if (rowDark[y] > 0.18 && rowDark[y] < 0.7 && rowDark[y - 1] < 0.08 && rowDark[y + 1] < 0.08) {
      let xStart = -1;
      let xEnd = -1;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (lum < 90) {
          if (xStart < 0) xStart = x;
          xEnd = x;
        }
      }
      const w = xEnd - xStart;
      if (xStart >= 0 && w > width * 0.15 && w < width * 0.85) {
        const scale = 1; // canvas already at render scale; store canvas coords — caller maps
        fields.push({
          id: `auto-${pageIndex}-${y}`,
          name: `Field_${fields.length + 1}`,
          type: "text",
          pageIndex,
          x: xStart * scale,
          y: (y - 18) * scale,
          width: w * scale,
          height: 20 * scale,
        });
        y += 12; // skip nearby
      }
    }
  }

  const step = 4;
  for (let y = 0; y < height - 16; y += step) {
    for (let x = 0; x < width - 16; x += step) {
      const size = 14;
      let edge = 0;
      let interior = 0;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const onEdge = dy < 2 || dy >= size - 2 || dx < 2 || dx >= size - 2;
          if (lum < 100) {
            if (onEdge) edge++;
            else interior++;
          }
        }
      }
      if (edge > 20 && interior < 8) {
        fields.push({
          id: `auto-cb-${pageIndex}-${x}-${y}`,
          name: `Check_${fields.length + 1}`,
          type: "checkbox",
          pageIndex,
          x,
          y,
          width: 16,
          height: 16,
        });
        x += 20;
      }
    }
    if (fields.length > 40) break;
  }

  return fields.slice(0, 40);
}

export function createFormFieldId(): string {
  return `field_${newId()}`;
}

/** Size cap for calculate scripts (untrusted text from the inspector). */
const FORM_SCRIPT_MAX_LENGTH = 20_000;
const FORM_SCRIPT_TIMEOUT_MS = 2_000;

/** Sandbox document: `allow-scripts` without `allow-same-origin` gives an opaque origin, and CSP `default-src 'none'` blocks all network. */
function buildSandboxDocument(nonce: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'">
</head><body><script>
(function () {
  var NONCE = ${JSON.stringify(nonce)};
  var replied = false;
  function reply(payload) {
    if (replied) return;
    replied = true;
    payload.nonce = NONCE;
    parent.postMessage(payload, "*");
  }
  window.addEventListener("message", function (message) {
    if (message.source !== parent) return;
    var data = message.data;
    if (!data || data.nonce !== NONCE) return;
    var fields = data.fields || {};
    var incoming = data.eventValue;
    function getField(name) {
      var current = fields[name];
      return {
        value: current === undefined ? "" : current,
        get valueAsString() { return String(current === undefined ? "" : current); }
      };
    }
    var event = { value: incoming === undefined ? "" : incoming, rc: true, change: "", targetName: "" };
    try {
      var body = '"use strict";\n' + data.script + '\nreturn event;';
      var runner = new Function("event", "getField", body);
      var result = runner(event, getField);
      reply({ ok: result ? result.rc !== false : true, value: result ? result.value : undefined });
    } catch (error) {
      reply({ ok: false, error: String(error && error.message ? error.message : error) });
    }
  });
  reply({ ready: true });
})();
</script></body></html>`;
}

export interface FormScriptContext {
  fields: Record<string, string | boolean | number>;
  eventValue?: string | number | boolean;
}

export interface FormScriptResult {
  ok: boolean;
  value?: string | number | boolean;
  error?: string;
}

/** Runs a calculate/validate script behind a genuine origin boundary; a same-realm `new Function` is not a sandbox. */
export function runFormScript(
  script: string,
  context: FormScriptContext
): Promise<FormScriptResult> {
  if (!script.trim()) return Promise.resolve({ ok: true, value: context.eventValue });
  if (script.length > FORM_SCRIPT_MAX_LENGTH) {
    return Promise.resolve({ ok: false, error: "Calculate script is too long (20 KB limit)" });
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve({ ok: false, error: "Calculate scripts only run in the browser" });
  }
  if (!globalThis.crypto?.randomUUID) {
    return Promise.resolve({ ok: false, error: "This browser cannot run calculate scripts safely" });
  }

  return new Promise<FormScriptResult>((resolve) => {
    const nonce = crypto.randomUUID();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;";

    const sandbox: { settled: boolean; timer?: ReturnType<typeof setTimeout> } = { settled: false };

    const finish = (result: FormScriptResult) => {
      if (sandbox.settled) return;
      sandbox.settled = true;
      if (sandbox.timer) clearTimeout(sandbox.timer);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve(result);
    };

    const onMessage = (message: MessageEvent) => {
      // Accept replies only from this exact sandbox instance.
      if (message.source !== iframe.contentWindow) return;
      const data = message.data as
        | { nonce?: string; ready?: boolean; ok?: boolean; value?: unknown; error?: unknown }
        | null;
      if (!data || data.nonce !== nonce) return;

      if (data.ready) {
        iframe.contentWindow?.postMessage(
          { nonce, script, fields: context.fields, eventValue: context.eventValue ?? "" },
          "*"
        );
        return;
      }

      const value = data.value;
      finish({
        ok: data.ok === true,
        value:
          typeof value === "string" || typeof value === "number" || typeof value === "boolean"
            ? value
            : undefined,
        error: typeof data.error === "string" ? data.error : undefined,
      });
    };

    window.addEventListener("message", onMessage);
    sandbox.timer = setTimeout(
      () => finish({ ok: false, error: "Calculate script timed out" }),
      FORM_SCRIPT_TIMEOUT_MS
    );
    iframe.srcdoc = buildSandboxDocument(nonce);
    document.body.appendChild(iframe);
  });
}

export async function fillFormValues(
  bytes: Uint8Array,
  values: Record<string, string | boolean>
): Promise<Uint8Array> {
  const doc = await loadPdfLib(bytes);
  const form = doc.getForm();
  for (const [name, value] of Object.entries(values)) {
    try {
      const field = form.getField(name);
      const kind = pdfFieldKind(field);
      if (kind === "text" && typeof value === "string") {
        (field as PDFTextField).setText(value);
      } else if (kind === "checkbox") {
        const cb = field as PDFCheckBox;
        if (value) cb.check();
        else cb.uncheck();
      } else if (kind === "dropdown" && typeof value === "string") {
        (field as PDFDropdown).select(value);
      }
    } catch {
      // ignore missing
    }
  }
  form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  return savePdfBytes(doc);
}

export { PDFString };

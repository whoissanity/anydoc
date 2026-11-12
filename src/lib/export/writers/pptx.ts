"use client";

import { clampText } from "@/lib/security/escape";
import {
  headingFor,
  type DocumentContent,
  type ProgressHandler,
} from "../content";

// One slide per page (strongest heading as title); pptxgenjs assembles it in-browser.
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export async function buildPptx(
  content: DocumentContent,
  onProgress?: ProgressHandler
): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "AnyDoc";
  pptx.company = "AnyDoc";
  pptx.title = content.title;
  pptx.subject = "Exported from AnyDoc";

  const total = Math.max(1, content.pages.length);

  for (const [index, page] of content.pages.entries()) {
    onProgress?.(
      Math.round((index / total) * 90),
      `Building slide ${index + 1} of ${content.pages.length}…`
    );

    const slide = pptx.addSlide();
    const headingLine = page.lines.find((line) => line.level !== null);
    const heading = headingFor(page, `Page ${index + 1}`);
    const body = page.lines
      .filter((line) => line !== headingLine)
      .map((line) => line.text)
      .join("\n");

    slide.addText(clampText(heading, 140), {
      x: 0.45,
      y: 0.3,
      w: 9.1,
      h: 0.8,
      fontSize: 24,
      bold: true,
      color: "1A2330",
      valign: "top",
    });

    if (body.trim()) {
      slide.addText(clampText(body, 4000), {
        x: 0.45,
        y: 1.15,
        w: 9.1,
        h: 4.1,
        fontSize: 12,
        color: "333333",
        valign: "top",
      });
    }

    slide.addText(`${index + 1} / ${content.pages.length}`, {
      x: 8.9,
      y: 5.25,
      w: 0.9,
      h: 0.3,
      fontSize: 8,
      color: "9AA4B2",
      align: "right",
    });
  }

  onProgress?.(95, "Packaging presentation…");
  const result = (await pptx.write({ outputType: "blob" })) as unknown as Blob;
  // pptxgenjs labels the blob application/zip; re-tag it so the download stays a presentation.
  return result.slice(0, result.size, PPTX_MIME);
}

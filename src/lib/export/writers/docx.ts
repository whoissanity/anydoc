"use client";

import type { DocumentContent } from "../content";

// OOXML built in memory; the docx import is dynamic so its graph loads only on export.
export async function buildDocx(content: DocumentContent): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const headingLevels = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  } as const;

  const sections = content.pages.map((page, pageIndex) => {
    const children = [];

    if (pageIndex === 0) {
      children.push(new Paragraph({ text: content.title, heading: HeadingLevel.TITLE }));
    }

    for (const line of page.lines) {
      if (line.level) {
        children.push(new Paragraph({ text: line.text, heading: headingLevels[line.level] }));
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line.text, bold: line.bold, italics: line.italic })],
          })
        );
      }
    }

    // A section needs at least one block, and blank pages should still occupy a page.
    if (!children.length) children.push(new Paragraph(""));
    return { children };
  });

  const doc = new Document({
    creator: "AnyDoc",
    title: content.title,
    sections: sections.length ? sections : [{ children: [new Paragraph("No extractable text")] }],
  });

  return Packer.toBlob(doc);
}

import { PDFDocument, rgb, PageSizes, type PDFFont, type PDFPage } from "pdf-lib";
import { createAppFontCache } from "@/lib/text/embedded-fonts";
import { detectScripts } from "@/lib/fonts/scripts";

/** Only control characters are unsafe; real script faces are embedded for the rest. */
function pdfSafe(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ");
}

/** Last-resort WinAnsi text when an unsupported glyph run cannot be encoded. */
function winAnsiFallback(value: string): string {
  return value.replace(/[^\u0000-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

/** Renders heading/bullet-aware plain text to a Letter PDF, in the browser; no server round trip. */
export async function renderTextPdf(text: string, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("AnyDoc");

  const fontFor = createAppFontCache(doc);
  let regular: PDFFont | undefined;
  let bold: PDFFont | undefined;
  const baseFont = async (isBold: boolean) => {
    if (isBold) return (bold ??= await fontFor.get({ bold: true }));
    return (regular ??= await fontFor.get());
  };
  const margin = 54;
  const [pageWidth, pageHeight] = PageSizes.Letter;
  const maxWidth = pageWidth - margin * 2;

  let page: PDFPage = doc.addPage(PageSizes.Letter);
  let cursorY = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < margin) {
      page = doc.addPage(PageSizes.Letter);
      cursorY = pageHeight - margin;
    }
  };

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!rawLine.trim()) {
      cursorY -= 7;
      continue;
    }

    const heading = rawLine.match(/^(#{1,4})\s+(.*)$/);
    const bullet = rawLine.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = rawLine.match(/^\s*(\d{1,3}[.)])\s+(.*)$/);

    let content = rawLine.trim();
    let size = 11;
    let indent = 0;

    if (heading) {
      const level = heading[1].length;
      content = heading[2];
      size = level === 1 ? 20 : level === 2 ? 16 : 13;
      cursorY -= 6;
    } else if (bullet) {
      content = `• ${bullet[1]}`;
      indent = 14;
    } else if (numbered) {
      content = `${numbered[1]} ${numbered[2]}`;
      indent = 14;
    }

    // Mixed-script imports can contain Arabic and CJK on different lines; embed the
    // matching pack per script-bearing line while reusing the cached Latin faces.
    let font: PDFFont;
    if (detectScripts(content).length > 0) {
      font = await fontFor.get({ text: content, bold: !!heading });
    } else {
      font = await baseFont(!!heading);
    }

    const lineHeight = size * 1.38;
    for (const line of wrapText(pdfSafe(content), font, size, maxWidth - indent)) {
      ensureSpace(lineHeight);
      try {
        page.drawText(line, {
          x: margin + indent,
          y: cursorY,
          size,
          font,
          color: rgb(0.05, 0.05, 0.05),
        });
      } catch {
        // A script outside the vendored packs must not fail the whole import.
        page.drawText(winAnsiFallback(line), {
          x: margin + indent,
          y: cursorY,
          size,
          font,
          color: rgb(0.05, 0.05, 0.05),
        });
      }
      cursorY -= lineHeight;
    }
    if (heading) cursorY -= 4;
  }

  return doc.save();
}

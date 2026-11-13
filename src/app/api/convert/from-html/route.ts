import { NextRequest, NextResponse } from "next/server";
import { isSameOriginRequest, CROSS_ORIGIN_REFUSED } from "@/lib/security/request";
import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";

/** Stdlib Helvetica is WinAnsi; anything outside its repertoire would throw at draw time. */
function pdfSafe(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
    .replace(/[^\u0000-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, "?");
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(CROSS_ORIGIN_REFUSED, { status: 403 });
  }
  const body = await req.json();
  const html: string = typeof body.html === "string" ? body.html : "";
  if (html.length > 2_000_000) {
    return NextResponse.json({ error: "HTML input is too large" }, { status: 413 });
  }
  const text = pdfSafe(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
      .replace(/\s+/g, " ")
      .trim()
  );

  const doc = await PDFDocument.create();
  doc.setTitle("HTML Import");
  doc.setProducer("AnyDoc");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const margin = 50;
  const fontSize = 12;
  const lineHeight = 16;
  const [pageWidth, pageHeight] = PageSizes.Letter;
  const maxWidth = pageWidth - margin * 2;

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  let page = doc.addPage(PageSizes.Letter);
  let y = pageHeight - margin;
  for (const line of lines) {
    if (y < margin) {
      page = doc.addPage(PageSizes.Letter);
      y = pageHeight - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }

  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="from-html.pdf"',
    },
  });
}

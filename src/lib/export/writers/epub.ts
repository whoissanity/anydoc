"use client";

import JSZip from "jszip";
import { escapeXml } from "@/lib/security/escape";
import { headingFor, type DocumentContent, type ProgressHandler } from "../content";

/** Also the MIME of the generated Blob, not just the package's `mimetype` entry. */
const EPUB_MIME = "application/epub+zip";

// EPUB 3 hand-built with JSZip, client-side; page text XHTML-escaped against markup injection.
export async function buildEpub(
  content: DocumentContent,
  onProgress?: ProgressHandler
): Promise<Blob> {
  const chapters = content.pages.length ? content.pages : [{ index: 0, lines: [] }];
  const identifier = `urn:uuid:${crypto.randomUUID()}`;
  const modified = content.generatedAt.replace(/\.\d{3}Z$/, "Z");

  const chapterFiles = chapters.map((page, index) => {
    onProgress?.(
      Math.round((index / Math.max(1, chapters.length)) * 85),
      `Building chapter ${index + 1} of ${chapters.length}…`
    );

    const heading = escapeXml(headingFor(page, `Page ${index + 1}`));
    const blocks = page.lines
      .map((line) =>
        line.level
          ? `<h${line.level + 1}>${escapeXml(line.text)}</h${line.level + 1}>`
          : `<p>${escapeXml(line.text)}</p>`
      )
      .join("\n");

    return {
      name: `page-${index + 1}.xhtml`,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>${heading}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><section epub:type="chapter"><h1>${heading}</h1>
${blocks || "<p>[No extractable text on this page]</p>"}
</section></body>
</html>`,
    };
  });

  const navItems = chapters
    .map((page, index) => `<li><a href="page-${index + 1}.xhtml">${escapeXml(headingFor(page, `Page ${index + 1}`))}</a></li>`)
    .join("\n      ");

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
      ${navItems}
</ol></nav></body>
</html>`;

  const packageDoc = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${escapeXml(content.title)}</dc:title>
  <dc:language>en</dc:language>
  <dc:identifier id="pub-id">${escapeXml(identifier)}</dc:identifier>
  <meta property="dcterms:modified">${escapeXml(modified)}</meta>
 </metadata>
 <manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="css" href="style.css" media-type="text/css"/>
${chapterFiles
  .map(
    (chapter, index) =>
      `  <item id="page${index + 1}" href="${chapter.name}" media-type="application/xhtml+xml"/>`
  )
  .join("\n")}
 </manifest>
 <spine>
${chapterFiles.map((_, index) => `  <itemref idref="page${index + 1}"/>`).join("\n")}
 </spine>
</package>`;

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
 <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

  const css = `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.55; margin: 1.5em; }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.4em; }
p { margin: 0 0 0.75em; }`;

  onProgress?.(92, "Packaging EPUB…");

  const zip = new JSZip();
  zip.file("mimetype", EPUB_MIME, { compression: "STORE" });
  zip.file("META-INF/container.xml", container);
  zip.file("OEBPS/content.opf", packageDoc);
  zip.file("OEBPS/nav.xhtml", nav);
  zip.file("OEBPS/style.css", css);
  for (const chapter of chapterFiles) {
    zip.file(`OEBPS/${chapter.name}`, chapter.body);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: EPUB_MIME });
}

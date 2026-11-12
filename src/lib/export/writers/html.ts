"use client";

import { escapeHtml } from "@/lib/security/escape";
import type { DocumentContent } from "../content";

// Self-contained page with no scripts; every PDF text run is HTML-escaped against injected markup.
export function toHtml(content: DocumentContent): string {
  const body: string[] = [];

  for (const page of content.pages) {
    body.push('<section class="page">');
    for (const line of page.lines) {
      if (line.level) {
        body.push(`<h${line.level}>${escapeHtml(line.text)}</h${line.level}>`);
      } else {
        const style = [line.bold ? "font-weight:700" : "", line.italic ? "font-style:italic" : ""]
          .filter(Boolean)
          .join(";");
        body.push(style ? `<p style="${style}">${escapeHtml(line.text)}</p>` : `<p>${escapeHtml(line.text)}</p>`);
      }
    }
    body.push("</section>");
  }

  const tables = content.tables
    .map((table) => {
      const rows = table.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
        )
        .join("\n      ");
      return `<table>\n      ${rows}\n    </table>`;
    })
    .join("\n    ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="AnyDoc">
<title>${escapeHtml(content.title)}</title>
<style>
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; margin: 0 auto; max-width: 46rem; padding: 2.5rem 1.25rem; color: #1a2330; }
.page { border-bottom: 1px solid #e6e9ef; padding-bottom: 1.5rem; margin-bottom: 1.5rem; }
.page:last-child { border-bottom: 0; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
td, th { border: 1px solid #dfe3ea; padding: 0.4rem 0.6rem; text-align: left; }
h1, h2, h3 { line-height: 1.25; }
</style>
</head>
<body>
${body.join("\n")}
${tables ? `\n    <section class="tables">${tables}</section>` : ""}
</body>
</html>
`;
}

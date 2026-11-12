/** Escapers for every markup format this app emits; PDF text, form values and metadata are untrusted, so each is escaped (AGENTS.md rule 1). */

/** Removes C0/C1 control characters, which are invalid in every target format. */
export function stripControl(value: string): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/** Safe for XML text nodes, XML attributes, and HTML text/attributes. */
export function escapeXml(value: string): string {
  return stripControl(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** HTML escaping is the same superset of XML escaping. */
export const escapeHtml = escapeXml;

/** RTF uses `\`, `{` and `}` as control syntax; non-ASCII becomes `\uN?` so legacy readers stay happy. */
export function escapeRtf(value: string): string {
  let out = "";
  for (const char of stripControl(value)) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\\") out += "\\\\";
    else if (char === "{") out += "\\{";
    else if (char === "}") out += "\\}";
    else if (char === "\n") out += "\\line ";
    else if (code < 0x20) out += " ";
    else if (code < 0x80) out += char;
    else if (code > 0xffff) out += "?";
    else out += `\\u${code}?`;
  }
  return out;
}

/** Leading characters spreadsheets evaluate as formulas (CSV injection); a minus counts only when it starts a non-number, so negatives stay numeric. */
const CSV_FORMULA_START = /^[=+@\t\r]|^-(?![\d.,])/;

/** RFC 4180 quoting, plus neutralisation of leading formula characters. */
export function escapeCsvCell(value: string): string {
  const text = stripControl(String(value ?? ""));
  // The apostrophe is the spreadsheet "treat as text" marker: the cell keeps its literal value and is not executed.
  const safe = CSV_FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n\t]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Trims a long paragraph to a sane size for slide/eBook surfaces. */
export function clampText(value: string, max: number): string {
  const text = stripControl(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

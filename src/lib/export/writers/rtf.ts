"use client";

import { escapeRtf } from "@/lib/security/escape";
import type { DocumentContent } from "../content";

// RTF emitted directly; escapeRtf neutralises the backslash and brace control characters.
const BODY_SIZE = 22; // half-points → 11pt
const HEADING_SIZES = { 1: 34, 2: 28, 3: 24 } as const;

export function toRtf(content: DocumentContent): string {
  const paragraphs: string[] = [];

  for (const page of content.pages) {
    for (const line of page.lines) {
      const size = line.level ? HEADING_SIZES[line.level] : BODY_SIZE;
      const bold = line.bold || line.level !== null;
      const open = [bold ? "\\b" : "", line.italic ? "\\i" : ""].filter(Boolean).join(" ");
      const close = [bold ? "\\b0" : "", line.italic ? "\\i0" : ""].filter(Boolean).join(" ");

      paragraphs.push(
        `{\\pard\\fs${size}${open ? ` ${open}` : ""} ${escapeRtf(line.text)}${
          close ? ` ${close}` : ""
        }\\par}`
      );
    }
    paragraphs.push("{\\pard\\page\\par}");
  }

  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat{\\fonttbl{\\f0\\fswiss Helvetica;}}\n${paragraphs.join(
    "\n"
  )}\n}\n`;
}

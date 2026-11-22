/**
 * Single source of truth for links and placeholders used by the marketing
 * surface. Replace the bracketed values before publishing.
 */
export const SITE = {
  name: "AnyDoc",
<<<<<<< HEAD
  tagline: "The PDF, Word & Excel editor that never leaves your browser.",
=======
  tagline: "Edit any document. It never leaves this tab.",
>>>>>>> origin/v0/anydoc-design-system
  repo: "https://github.com/whoissanity/anydoc",
  issues: "https://github.com/whoissanity/anydoc/issues",
  license: "https://github.com/whoissanity/anydoc/blob/main/LICENSE",
  fontLicense: "/vendor/fonts/OFL.txt",
  email: "[INSERT EMAIL]",
  editorHref: "/editor",
} as const;
<<<<<<< HEAD
=======

/** Link to a file in the public repo, so every privacy claim can point at its proof. */
export function sourceUrl(path: string): string {
  return `${SITE.repo}/blob/main/${path}`;
}

export type InkFamily =
  | "pdf"
  | "word"
  | "sheet"
  | "slide"
  | "odf"
  | "ebook"
  | "image"
  | "text";

/** Supported formats. Add one line here and it appears on the site and in the editor. */
export const FORMATS: readonly { ext: string; family: InkFamily }[] = [
  { ext: "pdf", family: "pdf" },
  { ext: "docx", family: "word" },
  { ext: "rtf", family: "word" },
  { ext: "xlsx", family: "sheet" },
  { ext: "csv", family: "sheet" },
  { ext: "pptx", family: "slide" },
  { ext: "odt", family: "odf" },
  { ext: "ods", family: "odf" },
  { ext: "epub", family: "ebook" },
  { ext: "png", family: "image" },
  { ext: "jpg", family: "image" },
  { ext: "md", family: "text" },
  { ext: "html", family: "text" },
  { ext: "txt", family: "text" },
  { ext: "json", family: "text" },
];
>>>>>>> origin/v0/anydoc-design-system

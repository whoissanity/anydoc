# AnyDoc

**The most private document editor on the internet.**

Every PDF, form, redaction and conversion runs 100% inside your browser — no uploads, no accounts, no tracking. Your documents never leave your device.

AnyDoc is an offline-first document workbench: open a PDF, fill and sign it, redact it, split it, or convert it to Word / Excel / Markdown — all in one client-side app built on Next.js 15, pdf.js and pdf-lib.

## The privacy contract

These are not marketing lines; each one is a mechanism you can audit in the source.

- **No third-party SDKs.** No analytics, error-tracking or marketing scripts anywhere in the dependency tree.
- **No CDN or external asset loads.** PDF.js cmaps, the Tesseract OCR worker/core/language data and the Host Grotesk font are all vendored under [`public/vendor`](public/vendor) and served same-origin. No page load touches a font or script CDN.
- **Strict CSP.** [`next.config.ts`](next.config.ts) locks `default-src` to `'self'` and blocks outbound requests (`connect-src 'self' blob: data:`, `font-src 'self' data:`).
- **Zero client persistence.** No `localStorage`, `sessionStorage`, `IndexedDB` or cookies. Document bytes and extracted text live only in memory for the life of the tab.
- **Ephemeral server memory.** The only server routes are the two converters below. They build a PDF in memory and return it — nothing is logged, cached or written to disk.
- **Untrusted input handling.** Uploads are validated by file signature (`%PDF-`, PNG/JPEG magic bytes), never by extension or the browser-supplied MIME type.
- **Real redaction.** Redacted areas are re-rendered to a lossless raster and burned into the pixel stream. There is no recoverable text layer and no bypassable transparent overlay.

### The one server round trip to know about

Everything is client-side **except** Office→PDF and HTML→PDF creation. Those two paths (`/api/convert/from-office`, `/api/convert/from-html`) POST the file to this app's own Next.js server, convert it in memory, and hand the PDF straight back. There is no database, no disk write and no logging. If you want a strictly zero-round-trip path, use the **From Plain Text** or **From Images** creation options instead.

## Features

**Open & create** — drag in a PDF, or start a new document from images, plain text, HTML, Word, Excel or any supported document.

**Edit** — review markup (highlights, sticky notes, freehand ink), text and image editing, form fields (text, checkbox, radio, dropdown, list), signature stamps, and an AcroForm calculate-script runner that executes inside an isolated `sandbox` iframe rather than same-realm `eval`.

**Organize** — page numbers, watermarks, status stamps, PDF overlay, crop, resize to paper, N-up handouts, booklet imposition, join into one long page, table-of-contents editing, rotate all pages, auto-rotate sideways pages.

**Optimise** — compress (with a size-inflation guard that keeps the original bytes if the rebuild cannot shrink the file), flatten, remove blank pages, colour and contrast adjustment, repair.

**Security** — area redaction, search & redact (destroys matching text), sanitize (strips scripts, embedded files, form data, annotations and metadata), remove annotations, unlock form fields, metadata scrub.

**Split & Merge** — split every N pages, split by target file size, split at bookmarks, split odd/even, attach a file into the PDF.

**Inspect** — document report (a one-page health check), suggested file name, and version comparison with changed pages highlighted.

**On-device OCR** — Tesseract runs locally to add a text layer to scans; exports fall back to OCR text when a page has no native text layer.

**Convert & export** — Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`), OpenDocument (`.odt` / `.ods`), Rich Text (`.rtf`), Markdown, HTML, plain text, EPUB 3, CSV, JSON, PNG and JPEG.

> Certificate signing, password / permission encryption and PDF/A conversion are listed in the tool catalog but intentionally **unavailable** in the browser build — they require an OS keychain, a PDF encryption engine, or a server-side verifier such as veraPDF. The catalog marks them as unavailable rather than shipping a stub that does not work.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Zustand · pdf.js · pdf-lib · Tesseract.js · Vitest.

## Getting started

Requires Node.js 18.18 or later.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command         | What it does                                        |
| --------------- | --------------------------------------------------- |
| `npm run dev`   | Turbopack dev server                                |
| `npm run build` | Production build                                    |
| `npm start`     | Serve the production build                          |
| `npm run lint`  | ESLint                                              |
| `npm test`      | Vitest run                                          |

> `src/app/api/__tests__/convert-routes.test.ts` boots a real `next start` server, so run `npm run build` once before `npm test` on a fresh checkout.

## License

MIT — see [LICENSE](LICENSE). The vendored Host Grotesk font is licensed under the SIL Open Font License 1.1 ([`public/vendor/fonts/OFL.txt`](public/vendor/fonts/OFL.txt)).

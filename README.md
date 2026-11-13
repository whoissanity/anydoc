<div align="center">

# 📄 AnyDoc

### The PDF, Word & Excel editor that never leaves your browser.

No uploads. No accounts. No tracking. Every byte of every document you touch stays on your device, the whole time.

![Privacy](https://img.shields.io/badge/Privacy-100%25_Client--Side-brightgreen?style=for-the-badge)
![License](https://img.shields.io/github/license/whoissanity/anydoc?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=061931)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

</div>

<!--
  📸 Drop a screenshot or GIF of the editor here — it sells this in one second
  flat where three paragraphs of prose can't:
  ![AnyDoc editor screenshot](docs/screenshot.png)
-->

---

## Table of Contents

- [Why AnyDoc?](#why-anydoc)
- [The Privacy Contract](#the-privacy-contract)
- [The One Server Round Trip to Know About](#the-one-server-round-trip-to-know-about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Testing](#testing)
- [License](#license)

## Why AnyDoc?

AnyDoc started with a simple problem: needing to edit a PDF and not wanting to upload it anywhere to do it. Most online PDF editors charge money for basic text edits. Most "private" open-source alternatives still ask for an account, still phone home for fonts or analytics, or still can't actually edit text.

AnyDoc doesn't do any of that. No account, no paywall, no upload screen. Open a file, edit it, download it — all inside the tab you already have open.

## The Privacy Contract

These aren't marketing lines — every one of them is a mechanism you can go read in the source right now.

- **No third-party SDKs.** No analytics, error-tracking, or marketing scripts anywhere in the dependency tree. Check `package.json` yourself.
- **No CDN, ever.** PDF.js's character maps, the Tesseract OCR worker + WASM core + language data, and the Host Grotesk typeface are all vendored under [`public/vendor`](public/vendor) and served same-origin. No page load reaches a font, script, or data CDN.
- **A CSP that actually enforces it.** [`next.config.ts`](next.config.ts) ships a real `Content-Security-Policy` — `default-src 'self'`, `connect-src 'self' blob: data:`, `font-src 'self' data:`, `object-src 'none'`, `frame-ancestors 'none'` — plus HSTS and a locked-down `Permissions-Policy`. If a future change ever tried to sneak in a third-party request, the browser itself would block it.
- **Zero client persistence.** No `localStorage`, `sessionStorage`, `IndexedDB`, or cookies. Your document's bytes and any extracted text live only in memory, for the life of the tab.
- **Ephemeral server memory.** The only two server routes that exist build a PDF in memory and hand it straight back. Nothing is logged, cached, or written to disk — see below.
- **Untrusted input handling.** Every upload is validated by its file signature (`%PDF-`, PNG/JPEG magic bytes) — never by its extension or the browser's reported MIME type.
- **Real redaction.** A redacted area is re-rendered to a lossless raster and burned into the pixel stream. There's no recoverable text layer underneath and no bypassable transparent box on top.

## Features

**Open & create** — drag in a PDF, or start a new document from images, plain text, HTML, Word, Excel, or any supported format.

**Edit** — review markup (highlights, sticky notes, freehand ink), text and image editing, form fields (text, checkbox, radio, dropdown, list), signature stamps, and an AcroForm calculate-script runner that executes inside an isolated `sandbox` iframe rather than same-realm `eval`.

**Organize** — page numbers, watermarks, status stamps, PDF overlay, crop, resize to paper, N-up handouts, booklet imposition, join into one long page, table-of-contents editing, rotate all pages, auto-rotate sideways pages.

**Optimize** — compress (with a size-inflation guard that keeps the original bytes if a rebuild can't shrink the file), flatten, remove blank pages, colour and contrast adjustment, repair.

**Security** — area redaction, search-and-redact (destroys matching text), sanitize (strips scripts, embedded files, form data, annotations, and metadata), remove annotations, unlock form fields, metadata scrub.

**Split & Merge** — split every N pages, split by target file size, split at bookmarks, split odd/even, attach a file into the PDF.

**Inspect** — a one-page document health report, a suggested file name, and version comparison with changed pages highlighted.

**On-device OCR** — Tesseract runs locally to add a text layer to scans; exports fall back to OCR text when a page has no native text layer.

**Convert & export** — Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`), OpenDocument (`.odt` / `.ods`), Rich Text (`.rtf`), Markdown, HTML, plain text, EPUB 3, CSV, JSON, PNG, and JPEG.

> Certificate signing, password/permission encryption, and PDF/A conversion are listed in the tool catalog but intentionally **unavailable** in the browser build — they genuinely require an OS keychain, a PDF encryption engine, or a server-side verifier like veraPDF. We mark them as unavailable rather than ship a stub that silently doesn't work.

## Tech Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router) · React 19 · TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| PDF engine | pdf.js (render/parse) + pdf-lib (create/edit) |
| OCR | Tesseract.js — vendored, runs entirely on-device |
| Testing | Vitest + jsdom |

## Project Structure

```
anydoc/
├── public/vendor/            # every third-party asset, vendored same-origin
│   ├── pdfjs/cmaps/          #   PDF.js CJK character maps (.bcmap)
│   ├── tesseract/            #   OCR worker, WASM core, English traineddata
│   └── fonts/                #   Host Grotesk (SIL OFL 1.1), self-hosted
├── src/
│   ├── app/
│   │   ├── api/convert/
│   │   │   ├── from-html/    # the only 2 server routes — see "privacy contract"
│   │   │   └── from-office/  #   (Office / ODT / EPUB / RTF → PDF)
│   │   └── page.tsx          # client-only editor shell (ssr: false)
│   ├── components/
│   │   ├── editor/           # Ribbon, Workbench, Dialogs, Inspector, StatusBar
│   │   ├── viewer/           # PdfViewer / PdfPage — the pdf.js render loop
│   │   ├── workspaces/       # Landing / Viewer / File editor / Page editor
│   │   ├── panes/            # thumbnails, outline, attachments, layers
│   │   └── tools/            # ToolGallery, ToolDialog
│   ├── lib/
│   │   ├── document/         # load, validate, raster, optimize, document-service
│   │   ├── edit/             # annotate, forms, edit-engine, marks, split-advanced
│   │   ├── export/           # catalog + client-side writers (docx, pptx, xlsx, html, rtf, odf, epub)
│   │   ├── inspect/          # bookmarks, compare, extract
│   │   ├── ocr/               # Tesseract service + vendored asset paths
│   │   ├── security/         # CSP helpers, filename safety, same-origin checks
│   │   ├── text/             # fonts, layout, markdown
│   │   └── tools/            # the full tool catalog behind the Ribbon
│   └── store/editor-store.ts # single Zustand store for all editor state
├── next.config.ts            # CSP + security headers, canvas alias
└── vitest.config.mts
```

## Getting Started

Requires Node.js 18.18 or later.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Turbopack dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest run |

## Testing

`src/app/api/__tests__/convert-routes.test.ts` boots a real `next start` server, so run `npm run build` once before `npm test` on a fresh checkout.

## License

MIT — see [LICENSE](LICENSE). The vendored Host Grotesk font is licensed under the SIL Open Font License 1.1 ([`public/vendor/fonts/OFL.txt`](public/vendor/fonts/OFL.txt)).

<div align="center">

Made for the person who just needs to edit a PDF without giving it to anyone.

</div>

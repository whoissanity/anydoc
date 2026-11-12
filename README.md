# AnyDoc

![Frontend](https://img.shields.io/badge/Frontend-Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)
![Engine](https://img.shields.io/badge/Engine-PDF.js-red?style=for-the-badge)
![OCR](https://img.shields.io/badge/OCR-Tesseract.js-black?style=for-the-badge)
![State](https://img.shields.io/badge/State-Zustand-purple?style=for-the-badge)
![UI](https://img.shields.io/badge/UI-TailwindCSS-cyan?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Privacy](https://img.shields.io/badge/Privacy-100%25_Client_Side-green?style=for-the-badge)

## Why AnyDoc?

AnyDoc started with a simple problem: finding a PDF editor in an emergency. iLovePDF charges money to edit text. Open-source alternatives like Stirling PDF require an account and still lack text editing. AnyDoc solves this. It has no accounts, no paywalls, and no uploads. Everything happens in your browser, making it completely private.

## Description

AnyDoc is a browser‑based document editor that handles PDFs, Word files, spreadsheets, and presentations without sending data to a server. All processing—viewing, editing, form filling, redaction, and conversion—runs entirely in the client, so files never leave the user’s device.

The interface uses an Apple‑inspired dark theme with glass‑morphic surfaces and CSS custom properties. Document parsing relies on a mix of PDF.js, Tesseract.js, Mammoth, and other format‑specific libraries.

## Techniques

- **Client‑only rendering with dynamic imports** – The main editor shell is loaded with [`next/dynamic`](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading) and `ssr: false` in [`src/app/page.tsx`](src/app/page.tsx). This keeps document‑processing code out of the server bundle and avoids hydration mismatches.
- **Web Workers for heavy tasks** – OCR and PDF parsing run off the main thread via workers. Tesseract.js and PDF.js both use Web Workers (see [`Worker` on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Worker)).
- **CSS custom properties for theming** – The design system is built on CSS variables in [`src/app/globals.css`](src/app/globals.css). Surface elevations, text hierarchy, and accent colours are all tokens, making the Apple‑style dark mode straightforward to maintain. See [Using CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties).
- **Glass‑morphism with `backdrop-filter`** – Translucent panels use `backdrop-filter: blur()` to create frosted‑glass effects (see [`backdrop-filter` on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)).
- **Client‑side file handling with `File` and `Blob` APIs** – Files are read locally with the [File API](https://developer.mozilla.org/en-US/docs/Web/API/File) and generated outputs are saved via `file-saver`, so no upload endpoint is required.

## Technologies

- **PDF.js** (`pdfjs-dist`) – Renders PDF pages in the browser. Pre‑built CMaps live in [`public/vendor/pdfjs/cmaps`](public/vendor/pdfjs/cmaps).
- **Tesseract.js** – Runs OCR entirely in the browser. Language data is served from [`public/vendor/tesseract`](public/vendor/tesseract).
- **Mammoth** – Converts `.docx` to HTML.
- **ExcelJS** and **SheetJS‑style parsing** – Reads and writes spreadsheet data.
- **PptxGenJS** – Generates PowerPoint files.
- **pdf‑lib** – Creates and modifies PDFs (forms, redaction, merging).
- **Zustand** – Lightweight state management for the editor.
- **Tailwind CSS v4** – Utility‑first styling, configured via [`postcss.config.mjs`](postcss.config.mjs).
- **Lucide React** – Icon set.
- **Host Grotesk** – The typeface, loaded from [Google Fonts](https://fonts.google.com/specimen/Host+Grotesk).

The repository also contains a `.agents/skills/vercel-react-best-practices` directory—a structured collection of React performance rules intended for AI agents and LLMs. It is not part of the runtime app but is worth noting for teams using automated code review.

## Project structure

```text
.
├── .agents/
│   └── skills/
│       └── vercel-react-best-practices/
├── public/
│   └── vendor/
│       ├── pdfjs/
│       │   └── cmaps/
│       └── tesseract/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── editor/
│   │   ├── panes/
│   │   ├── shared/
│   │   ├── tools/
│   │   ├── viewer/
│   │   └── workspaces/
│   ├── lib/
│   └── store/
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── README.md
└── tsconfig.json

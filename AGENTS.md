# PDF Studio — Security & Vulnerability Guardrails

These are binding project rules. They apply to **every line of code read, written, refactored, or reviewed** in this repository. Treat this file as mandatory engineering policy, not optional advice.

You are acting as an expert Application Security Engineer auditing a client-side React / Vite / Next.js PDF editor codebase. Rigorously enforce the following protocols.

## 1. XSS & Input Sanitization (Critical for Text Overlays)

- Never inject raw user-provided strings or PDF metadata directly into HTML or the DOM without sanitization. Never use `dangerouslySetInnerHTML` unless the content is explicitly sanitized with DOMPurify first.
- Ensure all text annotation inputs, form fields, and search queries are properly escaped to prevent Cross-Site Scripting (XSS).
- Treat PDF-sourced text (document metadata, annotations, outline/bookmark titles, form field values, embedded filenames) as untrusted input everywhere it is rendered, not just in direct user-entry paths.

## 2. Safe File Handling & Untrusted Binary Processing

- Treat **all** user-uploaded PDF files as untrusted input.
- Ensure `PDF.js` and `pdf-lib` run in sandboxed or safe parsing modes where possible, protecting against malformed-PDF structure exploits (e.g. buffer overflows, infinite loops in nested object streams).
- When handling `Blob` URLs or `ArrayBuffer`s, ensure proper cleanup with `URL.revokeObjectURL()` to prevent memory leaks and dangling resource references.

## 3. Client-Side Cryptography & Redaction Integrity

- For redactions, ensure exporting **permanently burns** the redaction into the pixel stream (flattening via canvas rasterization) rather than only drawing a transparent CSS overlay that can be bypassed or inspected.
- Ensure any encryption, password protection, or signing features implemented via `pdf-lib` correctly validate keys and avoid weak hashing algorithms.

## 4. Supply Chain & Dependencies

- Whenever a new npm package is suggested or installed, verify its security posture. Flag packages with known vulnerabilities or bloated/unnecessary permission scopes.

## 5. Automated Vulnerability Flagging

- If insecure code patterns are noticed (such as unvalidated file type checks, missing error boundaries around file parsers, or exposed sensitive tokens), **immediately halt implementation**, explain the vulnerability, and provide a secure patch.

## 6. Privacy & Telemetry (pre-flight checklist)

Run this checklist before, during and after **any** change. The app's selling point is that documents never leave the machine; a single dependency or header edit can silently break that promise.

- [ ] **Zero Third-Party SDKs.** Never install analytics, error tracking, or marketing scripts (no Google Analytics, Sentry, PostHog, Mixpanel, Segment, Hotjar, LogRocket, Datadog, Plausible, Umami, etc.). No telemetry pings, beacons or `reportError` shims.
- [ ] **No CDN Font/Asset Dependencies.** All fonts, scripts and WASM binaries (Tesseract worker/core/language data, PDF.js worker, CJK cmaps) must be bundled locally under `public/vendor` and served same-origin. No `@import url('https://…')`, no `next/script`, no external `<link>`/`<script>`, no `fonts.googleapis.com` / `fonts.gstatic.com`.
- [ ] **Ephemeral Server Memory.** Any server-side file processing must happen purely in-memory (`Buffer.from(...)`) with zero database logging, file writing, or session caching. Never persist uploads or extracted text.
- [ ] **Client persistence is limited to the opt-in local draft + user font library.** No `localStorage`, `sessionStorage` or cookies for document content. Document drafts use IndexedDB only via `src/lib/storage/draft-store.ts`: one document snapshot (plaintext by default, or AES-GCM ciphertext when the user opts in), two boolean preferences (autosave on/off, first-run notice), and one non-content encryption salt (PBKDF2 salt + iteration count, written only when the user opts in). It must never be transmitted anywhere, must expire after 48 hours, must clear on explicit save and clean close, and must stay disable-able from the **Local draft** control. A second, clearly separate IndexedDB database (`anydoc-user-fonts` in `src/lib/fonts/user-fonts.ts`) may store user-added font files only — never document bytes — with the UI disclosure that fonts stay on-device and the adder is responsible for usage rights. Revoke any `URL.createObjectURL` blob when done.
- [ ] **Strict Content Security Policy.** Maintain the locked-down CSP in `next.config.ts` that blocks unauthorized outbound connections; any CSP loosening (new external origin in `script-src`/`style-src`/`font-src`/`connect-src`/`img-src`) is a privacy regression and must be justified or rejected.

Any PR that would violate a box above is a hard stop under Rule 5: report it and patch before proceeding, or explicitly get the user's sign-off that the privacy stance has changed.

Closed gaps: the Host Grotesk font is self-hosted under `public/vendor/fonts` with the CSP tightened to `font-src 'self' data:` / `style-src 'self' 'unsafe-inline'`, and Office/HTML → PDF conversion now runs entirely in the browser (`src/lib/document/office-extract.ts`, `text-to-pdf.ts`), so there is no upload endpoint. Parser/render faults are contained by the `/editor` route boundary (`src/app/editor/error.tsx`) and the canvas-subtree boundary (`src/components/editor/EditorErrorBoundary.tsx`); the viewer virtualizes page canvases, caps per-page render time and bitmap size, and the editor rejects documents above 5,000 pages / 100 MB with a readable message. Re-run this checklist whenever a new server route, external asset or dependency is added.

## Enforcement Notes

- Rule 5 is a hard stop: do not continue writing feature code on top of a suspected vulnerability until it is reported and patched.
- All of the above applies to new code and to existing code touched during any task.
- File-type validation must check content, not only the extension or the client-supplied MIME type.
- Nothing in these rules may be silently weakened to make a check, build, or test pass.

## Security Skill (mandatory)

`.agents/skills/VibeSec-Skill/SKILL.md` is the project's bug-hunter checklist. It is pinned in `skills-lock.json` (source `BehiSecc/VibeSec-Skill`, Apache-2.0) and must be applied to **new code and to any code touched during a task**, in addition to the rules above. Read it before a security review rather than working from memory.

Its categories and their status in this codebase:

| Category | Applies here | Where |
| --- | --- | --- |
| XSS / output encoding | Yes | Every render sink; PDF metadata, annotation and form text are untrusted |
| CSRF / same-origin | No current surface | No state-changing endpoints — all conversion and editing is client-side |
| Insecure file upload | Yes | `src/lib/document/validate.ts` and `src/lib/document/office-extract.ts` (magic bytes, size caps, archive caps) |
| XXE | Yes | Office/ODF archives rejected when they declare a DTD or entity |
| Security headers / CSP | Yes | `next.config.ts` |
| Secret exposure | Yes | No secrets may enter client bundles or `NEXT_PUBLIC_*` |
| SSRF, open redirect, path traversal, SQL injection | No current surface | No server-side fetch of user URLs, no redirects, no filesystem or database access |
| JWT, password storage, session lifecycle, IDOR, mass assignment | No current surface | The app has no accounts, sessions or persistence |

Re-check the last two rows before adding authentication, a database, user-provided URLs, file paths or navigation to the app; the skill's guidance becomes binding at that point. Where the skill and this file disagree, the stricter control wins.
<<<<<<< HEAD
=======

# AnyDoc Design System — binding rules

These rules describe the look and feel the owner approved. They apply to every UI change, on the marketing pages (`src/app/(marketing)`, `src/app/marketing.css`) and in the editor (`src/components/**`, `src/app/globals.css`). Do not "improve" them; extend them.

## The idea

AnyDoc is a privacy tool that proves its claim instead of asserting it. The design is a quiet, near-black editorial page: big serif headlines, calm sans body text, monospace for anything that is evidence (file names, counts, paths). No gradients, no glass, no illustration, no stock imagery, no emoji. One accent green means "verified / nothing left your device". Everything else is off-white on black, with color reserved for file-format identity.

## Typography (the part that must never break)

Exactly three roles, defined once in `src/app/globals.css` as CSS variables. Always reference the variable; never hard-code a family in a component or stylesheet.

| Role | Variable | Family | Use |
| --- | --- | --- | --- |
| Headlines | `--font-display` | **Merriweather** 700 / 900 | `h1`, `h2`, section titles, the editor `.display-headline`. Nothing else. |
| Body and UI | `--font-body`, `--font-ui` | **Libre Franklin** 400 / 500 / 600 / 700 | Paragraphs, buttons, inputs, menus, labels, dropdowns. |
| Evidence | `--font-mono` | Vendored Mono | File extensions, eyebrow lines, counters, paths, status text. |

Rules:

- Headlines are serif, body is sans. Never put Merriweather on body copy or Libre Franklin on a headline.
- Do not reintroduce **Host Grotesk** (the former font) or add a fourth family. Do not add Inter, Geist, Open Sans, Space Grotesk, Roboto, or any Google font.
- Fonts are self-hosted as `.woff2` in `public/vendor/fonts/` and declared with `@font-face` at the top of `globals.css`. Never use `next/font/google`, `@import url(https://…)`, `<link>` to a font CDN, or `next/script` (Privacy rule 6 — a CDN font is a privacy regression and the CSP will block it).
- Every stack keeps the Noto fallbacks (Arabic, Devanagari, JP, KR, SC) so all supported locales render. Do not strip them from `--font-display` / `--font-body`.
- Do not touch `font-synthesis`, `font-weight` ranges, or the `@font-face` blocks to "fix" something without checking the page in at least one non-Latin locale.
- Native `<select>` options must follow the theme: white text on dark, black text on light.

## Color and surfaces

- Use the tokens in `globals.css` (`--c-bg`, `--c-surface*`, `--c-text-heading`, `--c-text`, `--c-text-muted`, `--c-text-subtle`, `--c-border*`, `--c-brand`). Never hard-code hex values in components.
- Dark is the default and the reference: background `#000`, text `#f4f4ef` (warm off-white, never pure white for body copy). Light theme mirrors it through the same tokens.
- `--c-brand` green (`#3ddc84`) is reserved for the "0 external requests" proof and verified states. Do not use it for decoration or primary buttons.
- Format colors (`--ink-pdf`, `--ink-word`, `--ink-sheet`, `--ink-slide`, `--ink-odf`, `--ink-ebook`, `--ink-image`, `--ink-text`) only appear in the `FormatSpectrum` strip and format chips.
- Primary button is off-white fill with near-black text (`--c-btn-*`); secondary is a bordered ghost. One primary action per view.
- Depth comes from 1px borders (`--c-border*`) and the `--shadow-divider-*` hairlines, not blur or large shadows. `--glass-blur` is intentionally `none`.
- Radii come from `--radius-*` (6 / 8 / 10 / 14). Do not mix in arbitrary values.

## Layout and rhythm

- Marketing pages use `.mkt-container` (max width 1200px) with generous vertical space and hairline `border-top` dividers between sections. Flexbox first, Grid only for true two-dimensional layouts.
- Section headers are numbered with **large serif numerals**, written `1.`, `2.`, `3.` and set in `--font-display` at heading scale next to the section title. Do not go back to `§01`-style mono markers.
- The live request counter in the hero is the one exception to the numeral rule: it stays as the large green `0` with its mono label and muted sub-line. Do not restyle or relocate it.
- The editor is dense and tool-like: fixed `--bar-h` top bar, `--rail-w` icon rail, `--statusbar-h` status bar. Keep those variables as the single source of truth for chrome sizes.
- Eyebrow lines (`open source / MIT / no account`, `AnyDoc / open source / runs in this tab`) are lowercase mono, muted, above the headline.
- Copy is plain and specific. Short sentences, concrete claims tied to a file in the repo. No marketing superlatives, no "seamless / powerful / revolutionary", no decorative filler.

## Internationalization (localization must keep working)

- Every user-visible string goes through `useI18n().t("key")` from `src/components/providers/I18nProvider.tsx`. No hard-coded English in components, including marketing pages, the header, the footer, status text, tooltips and `aria-label`s that users read.
- A new key must be added to **every** locale file in `src/locales/*.json` (not only English; supported locales are listed in `src/lib/i18n/config.ts`), with `{placeholder}` interpolation passed as the second argument of `t`. Missing keys must never render as the raw key name.
- Server components cannot call `t`. If a section needs translation, move its text into a small `"use client"` component (see `MarketingHero`, `SkipLink`, `SiteHeader`) rather than leaving it in English.
- The language switcher (`src/components/shared/LanguageSelector.tsx`) lives in the editor top bar **and** in the marketing `SiteHeader`, so it is visible on the landing page, the privacy page and every other marketing route. Do not remove it from either place. Selecting a language sets `document.documentElement.lang`/`dir` and persists the choice (this is the one allowed preference stored outside the draft store; it is not document content).
- Support RTL locales (Arabic, Persian, Urdu): prefer logical CSS properties (`margin-inline-start`, `padding-inline`, `text-align: start`) over left/right.

## Before you finish a UI change

1. Open `/`, `/privacy` and `/editor` in the preview, in dark and light themes.
2. Switch the language to Spanish and Arabic: no English leftovers, nothing overflowing, headline still Merriweather, body still Libre Franklin.
3. Confirm the counter still reads `0` and the browser makes no request to a non-same-origin host.
4. Run `pnpm exec tsc --noEmit` and `pnpm exec eslint` on the files you touched.
>>>>>>> origin/v0/anydoc-design-system

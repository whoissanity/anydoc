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

import type { Metadata } from "next";
import Link from "next/link";
<<<<<<< HEAD
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "AnyDoc — The document editor that never leaves your browser",
  description:
    "No uploads. No accounts. No tracking. Every byte of every document you touch stays on your device, the whole time.",
};

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Open & create",
    body: "Drag in a PDF, or start a new document from images, plain text, HTML, Word, Excel, or any supported format.",
  },
  {
    title: "Edit",
    body: "Review markup (highlights, sticky notes, freehand ink), text and image editing, form fields (text, checkbox, radio, dropdown, list), signature stamps, and an AcroForm calculate-script runner that executes inside an isolated sandbox iframe rather than same-realm eval.",
  },
  {
    title: "Organize",
    body: "Page numbers, watermarks, status stamps, PDF overlay, crop, resize to paper, N-up handouts, booklet imposition, join into one long page, table-of-contents editing, rotate all pages, auto-rotate sideways pages.",
  },
  {
    title: "Optimize",
    body: "Compress (with a size-inflation guard that keeps the original bytes if a rebuild can't shrink the file), flatten, remove blank pages, colour and contrast adjustment, repair.",
  },
  {
    title: "Security",
    body: "Area redaction, search-and-redact (destroys matching text), sanitize (strips scripts, embedded files, form data, annotations, and metadata), remove annotations, unlock form fields, metadata scrub.",
  },
  {
    title: "Split & merge",
    body: "Split every N pages, split by target file size, split at bookmarks, split odd/even, attach a file into the PDF.",
  },
  {
    title: "Inspect",
    body: "A one-page document health report, a suggested file name, and version comparison with changed pages highlighted.",
  },
  {
    title: "On-device OCR",
    body: "Tesseract runs locally to add a text layer to scans; exports fall back to OCR text when a page has no native text layer.",
  },
  {
    title: "Convert & export",
    body: "Word (.docx), PowerPoint (.pptx), Excel (.xlsx), OpenDocument (.odt / .ods), Rich Text (.rtf), Markdown, HTML, plain text, EPUB 3, CSV, JSON, PNG, and JPEG.",
  },
];

export default function LandingPage() {
  return (
    <main id="main" tabIndex={-1}>
      <section className="mkt-hero" aria-labelledby="hero-title">
        <div className="mkt-container">
          <p className="mkt-eyebrow">
            <span className="mkt-dot" aria-hidden="true" />
            100% client-side · no account required
          </p>
          <h1 id="hero-title">{SITE.tagline}</h1>
          <p className="mkt-lede">
            No uploads. No accounts. No tracking. Every byte of every document you
            touch stays on your device, the whole time.
          </p>

          <div className="mkt-actions">
            <Link href={SITE.editorHref} className="mkt-btn mkt-btn-primary">
              Open the Editor
              <span aria-hidden="true">→</span>
            </Link>
            <a href={SITE.repo} className="mkt-btn mkt-btn-secondary">
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <div className="mkt-strip">
        <div className="mkt-container mkt-strip-inner">
          <p className="mkt-strip-item">No uploads</p>
          <p className="mkt-strip-item">No accounts</p>
          <p className="mkt-strip-item">No tracking</p>
        </div>
      </div>

      <section id="privacy" className="mkt-section" aria-labelledby="privacy-title">
        <div className="mkt-container mkt-split">
          <div className="mkt-split-aside">
            <p className="mkt-kicker">Privacy</p>
            <h2 id="privacy-title">The privacy contract</h2>
            <p className="mkt-section-lede">
              These aren&apos;t marketing lines — every one of them is a mechanism
              you can go read in the source right now.
            </p>
            <Link href="/privacy" className="mkt-text-link">
              Read the Privacy Policy <span aria-hidden="true">→</span>
            </Link>
          </div>

          <ol className="mkt-contract">
            <li>
              <strong>No third-party SDKs.</strong> No analytics, error-tracking, or
              marketing scripts anywhere in the dependency tree. Check{" "}
              <code>package.json</code> yourself.
            </li>
            <li>
              <strong>No CDN, ever.</strong> PDF.js&apos;s character maps, the
              Tesseract OCR worker + WASM core + language data, and the Host Grotesk
              typeface are all vendored under <code>public/vendor</code> and served
              same-origin. No page load reaches a font, script, or data CDN.
            </li>
            <li>
              <strong>A CSP that actually enforces it.</strong>{" "}
              <code>next.config.ts</code> ships a real{" "}
              <code>Content-Security-Policy</code> — <code>default-src &apos;self&apos;</code>,{" "}
              <code>connect-src &apos;self&apos; blob: data:</code>,{" "}
              <code>font-src &apos;self&apos; data:</code>, <code>object-src &apos;none&apos;</code>,{" "}
              <code>frame-ancestors &apos;none&apos;</code> — plus HSTS and a
              locked-down <code>Permissions-Policy</code>. If a future change ever
              tried to sneak in a third-party request, the browser itself would
              block it.
            </li>
            <li>
              <strong>A local draft, only if you want it.</strong> Autosave (on by
              default) keeps your latest unsaved draft in this browser&apos;s{" "}
              <code>IndexedDB</code> so a crash doesn&apos;t cost you your work. It
              never leaves your device, expires after 48 hours, and clears when you
              save or close the document. Drafts are stored unencrypted by default;
              the <strong>Local draft</strong> control says so and can turn on
              optional passphrase encryption (PBKDF2 + AES-GCM) computed in this tab.
              Documents over 20 MB are not copied into a draft — autosave pauses and
              tells you instead of failing silently. No cookies, no{" "}
              <code>localStorage</code>, no analytics storage.
            </li>
            <li>
              <strong>Ephemeral server memory.</strong> Any server-side processing
              builds a PDF in memory and hands it straight back. Nothing is logged,
              cached, or written to disk.
            </li>
            <li>
              <strong>Untrusted input handling.</strong> Every upload is validated by
              its file signature (<code>%PDF-</code>, PNG/JPEG magic bytes) — never
              by its extension or the browser&apos;s reported MIME type.
            </li>
            <li>
              <strong>Real redaction.</strong> A redacted area is re-rendered to a
              lossless raster and burned into the pixel stream. There&apos;s no
              recoverable text layer underneath and no bypassable transparent box on
              top.
            </li>
          </ol>
        </div>
      </section>

      <section id="features" className="mkt-section" aria-labelledby="features-title">
        <div className="mkt-container">
          <p className="mkt-kicker">Features</p>
          <h2 id="features-title">A full document studio, in a tab.</h2>
          <p className="mkt-section-lede">
            Viewing, editing, forms, redaction, organizing and conversion — all
            running in the browser you already have open.
          </p>

          <div className="mkt-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="mkt-card">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>

          <p className="mkt-note">
            Certificate signing, password/permission encryption, and PDF/A
            conversion are listed in the tool catalog but intentionally unavailable
            in the browser build — they genuinely require an OS keychain, a PDF
            encryption engine, or a server-side verifier. They are marked as
            unavailable rather than shipped as a stub that silently doesn&apos;t
            work.
=======
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { SITE, sourceUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description:
    "An open-source document editor that runs entirely in your browser. No uploads, no accounts, no tracking. PDF, Word, Excel and more.",
};

const CLAUSES: { title: string; body: React.ReactNode; verify: string; path: string }[] = [
  {
    title: "No third-party SDKs.",
    body: "No analytics, error tracking or marketing scripts anywhere in the dependency tree.",
    verify: "package.json",
    path: "package.json",
  },
  {
    title: "No CDN, ever.",
    body: "PDF.js character maps, the OCR worker and WASM core, and the typeface are all served from this origin.",
    verify: "public/vendor",
    path: "public/vendor",
  },
  {
    title: "A CSP that enforces it.",
    body: (
      <>
        <code>default-src &apos;self&apos;</code>, <code>connect-src &apos;self&apos; blob: data:</code>,{" "}
        <code>frame-ancestors &apos;none&apos;</code>. If a future change tried to add a
        third-party request, the browser would block it.
      </>
    ),
    verify: "next.config.ts",
    path: "next.config.ts",
  },
  {
    title: "No server in the loop.",
    body: "There is no upload endpoint. Conversion, OCR and export run in this tab, so nothing exists on a server to log, cache or leak.",
    verify: "src/lib/document",
    path: "src/lib/document",
  },
  {
    title: "A local draft, only if you want it.",
    body: "Autosave keeps one unsaved draft in this browser's IndexedDB. It expires after 48 hours, clears when you save or close, and can be turned off or encrypted with a passphrase. No cookies, no localStorage.",
    verify: "draft-store.ts",
    path: "src/lib/storage/draft-store.ts",
  },
  {
    title: "Files are checked by content.",
    body: "Uploads are validated by their signature bytes, never by extension or the browser's reported MIME type.",
    verify: "validate.ts",
    path: "src/lib/document/validate.ts",
  },
  {
    title: "Redaction is burned in.",
    body: "A redacted area is rasterised into the pixel stream. No hidden text layer underneath, no transparent box on top.",
    verify: "bake.ts",
    path: "src/lib/edit/bake.ts",
  },
];

const TOOLS: { name: string; gist: string }[] = [
  { name: "Open & create", gist: "PDF, images, text, HTML" },
  { name: "Edit", gist: "markup, text, forms, signatures" },
  { name: "Organize", gist: "pages, watermarks, crop, booklets" },
  { name: "Optimize", gist: "compress, flatten, repair" },
  { name: "Redact", gist: "burned into pixels" },
  { name: "Sanitize", gist: "scripts, metadata, embedded files" },
  { name: "Split & merge", gist: "by pages, size or bookmarks" },
  { name: "Inspect", gist: "health report, version compare" },
  { name: "OCR", gist: "Tesseract, on this device" },
  { name: "Convert", gist: "DOCX, XLSX, PPTX, ODT, EPUB, MD" },
];

export default function LandingPage() {
  return (
    <main id="main" tabIndex={-1}>
      <MarketingHero />

      <section id="privacy" className="mkt-section" aria-labelledby="privacy-title">
        <div className="mkt-container">
          <header className="mkt-section-head">
            <p className="mkt-marker">1.</p>
            <h2 id="privacy-title">The privacy contract</h2>
            <p className="mkt-section-lede">
              Each clause points at the file that makes it true. Don&apos;t take my word for
              it.
            </p>
          </header>

          <ol className="mkt-clauses">
            {CLAUSES.map((clause) => (
              <li key={clause.title} className="mkt-clause">
                <div className="mkt-clause-text">
                  <strong>{clause.title}</strong> <span>{clause.body}</span>
                </div>
                <a href={sourceUrl(clause.path)} className="mkt-verify">
                  verify: {clause.verify} <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ol>

          <Link href="/privacy" className="mkt-text-link">
            Read the privacy policy <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section id="tools" className="mkt-section" aria-labelledby="tools-title">
        <div className="mkt-container">
          <header className="mkt-section-head">
            <p className="mkt-marker">2.</p>
            <h2 id="tools-title">What it does</h2>
          </header>

          <ul className="mkt-toc">
            {TOOLS.map((tool) => (
              <li key={tool.name} className="mkt-toc-row">
                <span className="mkt-toc-name">{tool.name}</span>
                <span className="mkt-toc-leader" aria-hidden="true" />
                <span className="mkt-toc-gist">{tool.gist}</span>
              </li>
            ))}
          </ul>

          <p className="mkt-note">
            Certificate signing, password encryption and PDF/A conversion appear in the tool
            list but are switched off in the browser build. They need an OS keychain or a
            server-side verifier, and I&apos;d rather mark them unavailable than ship a stub
            that quietly does nothing.
>>>>>>> origin/v0/anydoc-design-system
          </p>
        </div>
      </section>

      <section id="why" className="mkt-section" aria-labelledby="why-title">
        <div className="mkt-container">
<<<<<<< HEAD
          <p className="mkt-kicker">Why AnyDoc</p>
          <h2 id="why-title">Built because uploading shouldn&apos;t be the price.</h2>
          <div className="mkt-prose">
            <p>
              AnyDoc started with a simple problem: needing to edit a document and
              not wanting to upload it anywhere to do it. Most online document
              editors charge money for basic text edits. Most &quot;private&quot; open-source
              alternatives still ask for an account, still phone home for fonts or
              analytics, or still can&apos;t actually edit text.
            </p>
            <p>
              AnyDoc doesn&apos;t do any of that. No account, no paywall, no upload
              screen. Open a file, edit it, download it — all inside the tab you
              already have open.
=======
          <header className="mkt-section-head">
            <p className="mkt-marker">3.</p>
            <h2 id="why-title">Why this exists</h2>
          </header>
          <div className="mkt-prose">
            <p>
              {SITE.name} started with a simple problem: needing to edit a document and not
              wanting to upload it anywhere to do it. Most online editors charge for basic
              text edits. Most &quot;private&quot; open-source alternatives still want an
              account, or phone home for fonts and analytics, or can&apos;t edit text.
            </p>
            <p>
              This one doesn&apos;t. No account, no paywall, no upload screen. Open a file,
              edit it, download it, all inside the tab you already have open.
            </p>
            <p id="about" className="mkt-placeholder-block">
              <span className="mkt-placeholder">
                [INSERT: who built this and why. Replace this placeholder.]
              </span>
>>>>>>> origin/v0/anydoc-design-system
            </p>
          </div>
        </div>
      </section>

<<<<<<< HEAD
      <section
        id="open-source"
        className="mkt-section"
        aria-labelledby="open-source-title"
      >
        <div className="mkt-container">
          <p className="mkt-kicker">Open source</p>
          <h2 id="open-source-title">Read it, audit it, fork it.</h2>
          <p className="mkt-section-lede">
            The whole app is in the open. Contributions are welcome — bug reports,
            fixes, and new tools included.
          </p>

          <div className="mkt-repo">
            <div>
              <h3>whoissanity/anydoc</h3>
              <p>
                MIT-licensed. Issues and pull requests are welcome on GitHub.
              </p>
            </div>
            <span className="mkt-license">MIT License</span>
            <div className="mkt-repo-actions">
              <a href={SITE.repo} className="mkt-btn mkt-btn-secondary">
                View repository
              </a>
              <a href={SITE.issues} className="mkt-text-link">
                Report an issue <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="mkt-section" aria-labelledby="about-title">
        <div className="mkt-container mkt-split">
          <div className="mkt-split-aside">
            <p className="mkt-kicker">About</p>
            <h2 id="about-title">Who built this, and why.</h2>
          </div>
          <div className="mkt-about-copy">
            <p className="mkt-placeholder-block">
              <span className="mkt-placeholder">[INSERT: who built AnyDoc and why — replace this placeholder.]</span>
            </p>
            <p className="mkt-section-lede">
              This section is intentionally left for the maintainer to fill in.
            </p>
          </div>
        </div>
      </section>

      <section id="contact" className="mkt-section" aria-labelledby="contact-title">
        <div className="mkt-container mkt-split">
          <div className="mkt-split-aside">
            <p className="mkt-kicker">Contact</p>
            <h2 id="contact-title">Questions, bugs, feedback.</h2>
          </div>
          <div className="mkt-contact">
            <p>
              Email: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            </p>
            <p>
              Found a bug? Open an issue on{" "}
              <a href={SITE.issues}>GitHub Issues</a>.
            </p>
          </div>
=======
      <section id="open-source" className="mkt-section" aria-labelledby="source-title">
        <div className="mkt-container">
          <header className="mkt-section-head">
            <p className="mkt-marker">4.</p>
            <h2 id="source-title">Source and contact</h2>
          </header>

          <dl className="mkt-facts" id="contact">
            <div>
              <dt>Repository</dt>
              <dd>
                <a href={SITE.repo}>whoissanity/anydoc</a>
              </dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>
                <a href={SITE.license}>MIT</a>. Bug reports, fixes and new tools welcome.
              </dd>
            </div>
            <div>
              <dt>Bugs</dt>
              <dd>
                <a href={SITE.issues}>GitHub issues</a>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </dd>
            </div>
          </dl>
>>>>>>> origin/v0/anydoc-design-system
        </div>
      </section>
    </main>
  );
}

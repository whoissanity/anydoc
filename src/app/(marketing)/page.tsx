import type { Metadata } from "next";
import Link from "next/link";
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
          </p>
        </div>
      </section>

      <section id="why" className="mkt-section" aria-labelledby="why-title">
        <div className="mkt-container">
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
            </p>
          </div>
        </div>
      </section>

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
        </div>
      </section>
    </main>
  );
}

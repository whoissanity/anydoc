import Link from "next/link";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-inner">
          <div>
            <Link href="/" className="mkt-brand">
              <span className="mkt-brand-mark" aria-hidden="true">
                A
              </span>
              <span>{SITE.name}</span>
            </Link>
            <p>Private document editing that runs inside your browser.</p>
          </div>

          <nav aria-label="Footer">
            <ul className="mkt-footer-links">
              <li>
                <a href={SITE.repo}>GitHub</a>
              </li>
              <li>
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </li>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms">Terms of Service</Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mkt-footer-license">
          <span>
            AnyDoc is released under the{" "}
            <a href={SITE.license}>MIT License</a>.
          </span>
          <span>
            Bundled Host Grotesk typeface:{" "}
            <a href={SITE.fontLicense}>SIL Open Font License 1.1</a>.
          </span>
        </div>
      </div>
    </footer>
  );
}

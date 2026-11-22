import Link from "next/link";
<<<<<<< HEAD
=======
import { LiveRequestCount } from "@/components/marketing/LiveRequestCount";
import { BrandMark } from "@/components/shared/BrandMark";
>>>>>>> origin/v0/anydoc-design-system
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-inner">
          <div>
            <Link href="/" className="mkt-brand">
<<<<<<< HEAD
              <span className="mkt-brand-mark" aria-hidden="true">
                A
              </span>
=======
              <BrandMark />
>>>>>>> origin/v0/anydoc-design-system
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
<<<<<<< HEAD
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms">Terms of Service</Link>
=======
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
>>>>>>> origin/v0/anydoc-design-system
              </li>
            </ul>
          </nav>
        </div>

<<<<<<< HEAD
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
=======
        <p className="mkt-colophon">
          Set in Merriweather, Libre Franklin and Liberation Mono (
          <a href={SITE.fontLicense}>SIL OFL 1.1</a>), served from this origin. Code under the{" "}
          <a href={SITE.license}>MIT license</a>. No accounts, no trackers, no CDN.{" "}
          <LiveRequestCount variant="inline" />.
        </p>
>>>>>>> origin/v0/anydoc-design-system
      </div>
    </footer>
  );
}

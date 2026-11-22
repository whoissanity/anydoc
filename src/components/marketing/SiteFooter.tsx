import Link from "next/link";
import { LiveRequestCount } from "@/components/marketing/LiveRequestCount";
import { BrandMark } from "@/components/shared/BrandMark";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-inner">
          <div>
            <Link href="/" className="mkt-brand">
              <BrandMark />
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
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
            </ul>
          </nav>
        </div>

        <p className="mkt-colophon">
          Set in Merriweather, Libre Franklin and Liberation Mono (
          <a href={SITE.fontLicense}>SIL OFL 1.1</a>), served from this origin. Code under the{" "}
          <a href={SITE.license}>MIT license</a>. No accounts, no trackers, no CDN.{" "}
          <LiveRequestCount variant="inline" />.
        </p>
      </div>
    </footer>
  );
}

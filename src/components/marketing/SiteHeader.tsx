import Link from "next/link";
import { SITE } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="mkt-header">
      <div className="mkt-container mkt-header-inner">
        <Link href="/" className="mkt-brand">
          <span className="mkt-brand-mark" aria-hidden="true">
            A
          </span>
          <span>{SITE.name}</span>
        </Link>

        <nav className="mkt-nav" aria-label="Primary">
          <Link href="/#features">Features</Link>
          <Link href="/#privacy">Privacy</Link>
          <Link href="/#open-source">Open source</Link>
          <Link href="/#about">About</Link>
          <Link href={SITE.editorHref} className="mkt-nav-cta">
            Open the Editor
          </Link>
        </nav>
      </div>
    </header>
  );
}

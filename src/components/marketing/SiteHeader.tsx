import Link from "next/link";
import { BrandMark } from "@/components/shared/BrandMark";
import { SITE } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="mkt-header">
      <div className="mkt-container mkt-header-inner">
        <Link href="/" className="mkt-brand">
          <BrandMark />
          <span>{SITE.name}</span>
        </Link>

        <nav className="mkt-nav" aria-label="Primary">
          <Link href="/#privacy">Privacy</Link>
          <Link href="/#tools">Tools</Link>
          <Link href="/#open-source">Source</Link>
          <Link href={SITE.editorHref} className="mkt-nav-cta">
            Open editor
          </Link>
        </nav>
      </div>
    </header>
  );
}

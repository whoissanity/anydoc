import "../marketing.css";
import { MarketingBodyClass } from "@/components/marketing/MarketingBodyClass";
import { SiteFooter } from "@/components/marketing/SiteFooter";
<<<<<<< HEAD
=======
import { SkipLink } from "@/components/marketing/SkipLink";
>>>>>>> origin/v0/anydoc-design-system
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt">
<<<<<<< HEAD
      <a className="mkt-skip" href="#main">
        Skip to content
      </a>
=======
      <SkipLink />
>>>>>>> origin/v0/anydoc-design-system
      <MarketingBodyClass />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}

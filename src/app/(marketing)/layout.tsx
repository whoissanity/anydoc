import "../marketing.css";
import { MarketingBodyClass } from "@/components/marketing/MarketingBodyClass";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt">
      <a className="mkt-skip" href="#main">
        Skip to content
      </a>
      <MarketingBodyClass />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}

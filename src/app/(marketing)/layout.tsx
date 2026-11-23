import "../marketing.css";
import { MarketingBodyClass } from "@/components/marketing/MarketingBodyClass";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SkipLink } from "@/components/marketing/SkipLink";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt">
      <SkipLink />
      <MarketingBodyClass />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}

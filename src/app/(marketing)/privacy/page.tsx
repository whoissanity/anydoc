import type { Metadata } from "next";
import { PrivacyContent } from "@/components/marketing/LegalContent";

export const metadata: Metadata = {
  title: "Privacy Policy — AnyDoc",
  description:
    "What AnyDoc does and does not do with your data: no accounts, no cookies, no analytics, and no document storage.",
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}

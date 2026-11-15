import type { Metadata } from "next";
import { TermsContent } from "@/components/marketing/LegalContent";

export const metadata: Metadata = {
  title: "Terms of Service — AnyDoc",
  description:
    "The terms for using AnyDoc: as-is software, acceptable use, MIT-licensed code, and your ownership of your documents.",
};

export default function TermsPage() {
  return <TermsContent />;
}

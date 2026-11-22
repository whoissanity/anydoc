import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/components/providers/I18nProvider";

export const metadata: Metadata = {
  title: "AnyDoc — 100% Private Document Editor",
  description:
    "AnyDoc is the most private way to work with PDFs: viewing, editing, forms, redaction and conversion run entirely in your browser — your files never leave your device.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}

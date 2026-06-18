import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

const DESC =
  "منصة عربية تربط أصحاب الأعمال بالمستقلين — وظائف، خدمات مميزة، ومدفوعات آمنة بنظام الضمان";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "شغل أونلاين — وظائف وخدمات حرة", template: "%s | شغل أونلاين" },
  description: DESC,
  applicationName: "شغل أونلاين",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "شغل أونلاين",
    locale: "ar_AR",
    title: "شغل أونلاين — وظائف وخدمات حرة",
    description: DESC,
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image", title: "شغل أونلاين", description: DESC },
  robots: { index: true, follow: true },
};

// Arabic-first RTL (NFR-LOC-1). Locale routing reserved for future languages (NFR-LOC-2).
// Tajawal is loaded via <link> (not next/font) so builds never depend on
// network access to Google Fonts; the font swaps in at runtime.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap"
        />
      </head>
      <body className="font-sans">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

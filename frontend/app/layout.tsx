import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { JsonLd, SITE_URL, organizationLd, websiteLd } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import NavProgress from "@/components/NavProgress";
import "./globals.css";

const DESC =
  "منصة عربية تربط أصحاب الأعمال بالمستقلين — وظائف، خدمات مميزة، ومدفوعات آمنة بنظام الضمان";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "شغل أونلاين — وظائف وخدمات حرة", template: "%s | شغل أونلاين" },
  description: DESC,
  applicationName: "شغل أونلاين",
  keywords: ["شغل أونلاين", "وظائف", "عمل حر", "مستقلين", "خدمات مصغرة", "فريلانس", "عمل عن بعد", "مدفوعات بالضمان"],
  authors: [{ name: "شغل أونلاين" }],
  creator: "شغل أونلاين",
  publisher: "شغل أونلاين",
  category: "business",
  formatDetection: { telephone: false, email: false, address: false },
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
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
};

// Mobile browser chrome tint (brand blue) + sane default scaling.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1B3DBC",
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
        {/* site-wide identity for search engines (Knowledge Panel + sitelinks search box) */}
        <JsonLd data={[organizationLd(), websiteLd()]} />
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

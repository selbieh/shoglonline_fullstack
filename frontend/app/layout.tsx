import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { JsonLd, SITE_URL, organizationLd, websiteLd, serverApi } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter, { type SiteSettings } from "@/components/SiteFooter";
import NavProgress from "@/components/NavProgress";
import Analytics from "@/components/Analytics";
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
  // iOS home-screen icon. The favicon is handled by the app/icon.png file convention and the rest
  // of the install icons live in the PWA manifest — so we only add the apple-touch-icon here.
  icons: { apple: "/logo-mark.png" },
  // Search Console / Bing Webmaster ownership tags — emitted only when the token env is set, so
  // dev/preview builds stay clean. Verifying via the HTML meta tag avoids a DNS round-trip.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : {},
  },
};

// Mobile browser chrome tint (brand blue) + sane default scaling.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1B3DBC",
};

// Arabic-first RTL (NFR-LOC-1). Locale routing reserved for future languages (NFR-LOC-2).
// Tajawal is self-hosted (see @font-face in globals.css + /public/fonts) — no render-blocking
// request to Google Fonts and no runtime third-party dependency. We preload the two critical
// Arabic weights (400 body, 800 headings/LCP) so they land before first paint.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Footer contact / app / social links are admin-controlled (GET /site-settings). Fetched here
  // (server-side, cached) so the footer paints with no client flash; null on failure → i18n fallback.
  const footerSettings = await serverApi<SiteSettings>("/site-settings");
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preload" href="/fonts/tajawal-400-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/tajawal-800-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="font-sans">
        {/* GA4 — no-op unless NEXT_PUBLIC_GA_ID is set; tracks SPA page views */}
        <Analytics />
        {/* site-wide identity for search engines (Knowledge Panel + sitelinks search box) */}
        <JsonLd data={[organizationLd(), websiteLd()]} />
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <SiteHeader />
        {children}
        <SiteFooter settings={footerSettings} />
      </body>
    </html>
  );
}

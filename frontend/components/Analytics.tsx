"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

// GA4 Measurement ID (e.g. "G-XXXXXXXXXX"). Unset → analytics is fully disabled,
// so local/dev/preview builds never phone home. Public by design (NEXT_PUBLIC_*).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Fire a GA4 page_view on every client navigation. The App Router doesn't emit
 * these for SPA transitions, and we disable gtag's own send_page_view below, so
 * this effect is the single source of page views — covering first paint and
 * subsequent in-app navigations alike. useSearchParams forces the Suspense
 * boundary in the parent.
 */
function PageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!GA_ID || typeof window.gtag !== "function") return;
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams]);
  return null;
}

export default function Analytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: false });
        `}
      </Script>
      <Suspense fallback={null}>
        <PageViews />
      </Suspense>
    </>
  );
}

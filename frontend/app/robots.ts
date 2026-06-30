import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep private/authenticated areas + thin auth-gated forms out of the index. These pages
        // require a signed-in session, so they hold no crawlable content and must never compete
        // with the public catalog in search.
        disallow: [
          "/dashboard", "/wallet", "/contracts", "/messages", "/invoices",
          "/affiliate", "/support", "/tickets", "/me/", "/onboarding/", "/signin",
          "/bids", "/notifications", "/settings", "/subscriptions", "/jobs/new",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

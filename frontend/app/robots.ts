import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // keep private/authenticated areas out of the index
        disallow: [
          "/dashboard", "/wallet", "/contracts", "/messages", "/invoices",
          "/affiliate", "/support", "/tickets", "/me/", "/onboarding/", "/signin",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

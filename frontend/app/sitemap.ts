import type { MetadataRoute } from "next";
import { SITE_URL, serverApi } from "@/lib/seo";

type Slugged = { slug: string; updated_at?: string; published_at?: string };
type Freelancer = { id: number; updated_at?: string };
type Paginated<T> = { results: T[] };

type Entry = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [jobs, services, freelancers, pages] = await Promise.all([
    serverApi<Paginated<Slugged>>("/jobs?ordering=-published_at"),
    serverApi<Paginated<Slugged>>("/services"),
    serverApi<Paginated<Freelancer>>("/freelancers?ordering=-rating_avg"),
    serverApi<Paginated<Slugged>>("/pages"),
  ]);

  const entry = (
    path: string,
    opts: { lastmod?: string; changeFrequency?: Entry["changeFrequency"]; priority?: number } = {},
  ): Entry => ({
    url: `${SITE_URL}${path}`,
    lastModified: opts.lastmod ? new Date(opts.lastmod) : new Date(),
    changeFrequency: opts.changeFrequency,
    priority: opts.priority,
  });

  // landing + primary listing hubs crawl most often and rank highest
  const staticUrls: Entry[] = [
    entry("/", { changeFrequency: "daily", priority: 1.0 }),
    entry("/jobs", { changeFrequency: "hourly", priority: 0.9 }),
    entry("/services", { changeFrequency: "hourly", priority: 0.9 }),
    entry("/freelancers", { changeFrequency: "daily", priority: 0.8 }),
    entry("/gallery", { changeFrequency: "daily", priority: 0.6 }),
    entry("/faq", { changeFrequency: "monthly", priority: 0.4 }),
  ];

  // NOTE: category-filtered listing URLs (e.g. /jobs?category=design) are intentionally omitted.
  // The /jobs and /services pages carry a static self-canonical, so those query-string variants
  // consolidate to the base listing — including them here would only surface "Duplicate, Google
  // chose a different canonical" warnings in Search Console. Categories are still discoverable via
  // internal links from the listing/landing pages.
  const jobUrls = (jobs?.results ?? []).map((j) =>
    entry(`/jobs/${j.slug}`, { lastmod: j.published_at, changeFrequency: "weekly", priority: 0.7 }),
  );
  const serviceUrls = (services?.results ?? []).map((s) =>
    entry(`/services/${s.slug}`, { lastmod: s.published_at, changeFrequency: "weekly", priority: 0.7 }),
  );
  const freelancerUrls = (freelancers?.results ?? []).map((f) =>
    entry(`/freelancers/${f.id}`, { lastmod: f.updated_at, changeFrequency: "weekly", priority: 0.6 }),
  );
  const pageUrls = (pages?.results ?? []).map((p) =>
    entry(`/pages/${p.slug}`, { lastmod: p.updated_at, changeFrequency: "monthly", priority: 0.3 }),
  );

  return [...staticUrls, ...jobUrls, ...serviceUrls, ...freelancerUrls, ...pageUrls];
}

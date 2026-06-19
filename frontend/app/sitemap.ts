import type { MetadataRoute } from "next";
import { SITE_URL, serverApi } from "@/lib/seo";

type Slugged = { slug: string; updated_at?: string; published_at?: string };
type Paginated<T> = { results: T[] };
type Cat = { slug: string; children?: Cat[] };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [jobs, services, pages, cats] = await Promise.all([
    serverApi<Paginated<Slugged>>("/jobs?ordering=-published_at"),
    serverApi<Paginated<Slugged>>("/services"),
    serverApi<Paginated<Slugged>>("/pages"),
    serverApi<Cat[]>("/categories"),
  ]);

  const url = (path: string, lastmod?: string): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    lastModified: lastmod ? new Date(lastmod) : new Date(),
  });

  const staticUrls = ["/", "/jobs", "/services", "/gallery", "/faq"].map((p) => url(p));
  const categoryUrls = (cats ?? []).map((c) => url(`/jobs?category=${c.slug}`));
  const jobUrls = (jobs?.results ?? []).map((j) => url(`/jobs/${j.slug}`, j.published_at));
  const serviceUrls = (services?.results ?? []).map((s) => url(`/services/${s.slug}`, s.published_at));
  const pageUrls = (pages?.results ?? []).map((p) => url(`/pages/${p.slug}`, p.updated_at));

  return [...staticUrls, ...categoryUrls, ...jobUrls, ...serviceUrls, ...pageUrls];
}

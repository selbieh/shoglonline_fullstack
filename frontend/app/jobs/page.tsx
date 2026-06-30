import type { Category, Job, Paginated } from "@/lib/types";
import { JsonLd, serverApi, absoluteUrl } from "@/lib/seo";
import JobsClient, { type JobsFilters } from "./JobsClient";

/* Server-rendered jobs board (SEO): reads the URL filters, fetches the matching first page + the
   category tree, emits an ItemList, and seeds JobsClient — so crawlers/visitors get real SSR HTML.
   Metadata lives in ./layout.tsx. */

const PAGE = 12;
export const revalidate = 60;

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export default async function JobsPage({ searchParams }: { searchParams: SP }) {
  const filters: JobsFilters = {
    category: one(searchParams.category),
    subcategory: one(searchParams.subcategory),
    skill: one(searchParams.skill),
    q: one(searchParams.search),
  };

  const sp = new URLSearchParams({ ordering: "-published_at", limit: String(PAGE), offset: "0" });
  if (filters.category) sp.set("category", filters.category);
  if (filters.subcategory) sp.set("subcategory", filters.subcategory);
  if (filters.skill) sp.set("skill", filters.skill);
  if (filters.q) sp.set("search", filters.q);

  const [data, cats] = await Promise.all([
    serverApi<Paginated<Job>>(`/jobs?${sp}`),
    serverApi<Category[]>("/categories"),
  ]);
  const items = data?.results ?? [];

  const itemList = items.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: items.map((j, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: absoluteUrl(`/jobs/${j.slug}`),
          name: j.title,
        })),
      }
    : null;

  return (
    <>
      {itemList && <JsonLd data={itemList} />}
      <JobsClient
        initialItems={items}
        initialCount={data?.count ?? 0}
        initialHasMore={Boolean(data?.next)}
        seeded={data !== null}
        categories={cats ?? []}
        initialFilters={filters}
      />
    </>
  );
}

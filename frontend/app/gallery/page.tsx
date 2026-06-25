import type { Category, GalleryItem, Paginated } from "@/lib/types";
import { JsonLd, serverApi, absoluteUrl } from "@/lib/seo";
import GalleryClient, { PAGE, DEFAULT_SORT, type GalleryFilters } from "./GalleryClient";

/* Server-rendered works gallery (SEO): reads the URL filters, fetches the matching first page + the
   category tree, emits an ItemList, and seeds GalleryClient — so a shared/crawled filtered link is
   real SSR HTML. Metadata lives in ./layout.tsx. */

export const revalidate = 60;

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export default async function GalleryPage({ searchParams }: { searchParams: SP }) {
  const filters: GalleryFilters = {
    media: one(searchParams.media_type),
    category: one(searchParams.category),
    skill: one(searchParams.skill),
    q: one(searchParams.search),
    ordering: one(searchParams.ordering) || DEFAULT_SORT,
  };

  const sp = new URLSearchParams({ ordering: filters.ordering, limit: String(PAGE), offset: "0" });
  if (filters.media) sp.set("media_type", filters.media);
  if (filters.category) sp.set("category", filters.category);
  if (filters.skill) sp.set("skill", filters.skill);
  if (filters.q) sp.set("search", filters.q);

  const [data, cats] = await Promise.all([
    serverApi<Paginated<GalleryItem>>(`/freelancers/portfolio?${sp}`),
    serverApi<Category[]>("/categories"),
  ]);
  const items = data?.results ?? [];

  const itemList = items.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: items.map((it, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: absoluteUrl(`/freelancers/${it.worker_id}/portfolio/${it.id}`),
          name: it.title,
        })),
      }
    : null;

  return (
    <>
      {itemList && <JsonLd data={itemList} />}
      <GalleryClient
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

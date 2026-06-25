import type { Freelancer, Paginated } from "@/lib/types";
import { JsonLd, serverApi, absoluteUrl } from "@/lib/seo";
import FreelancersClient, { type Category } from "./FreelancersClient";

/* Server-rendered freelancer directory (SEO): page 1 + the category tree are fetched here so
   crawlers get real HTML and an ItemList; FreelancersClient handles filters/search/load-more.
   Metadata lives in ./layout.tsx. */

const PAGE = 12;
export const revalidate = 60;

export default async function FreelancersPage() {
  const [data, cats] = await Promise.all([
    serverApi<Paginated<Freelancer>>(`/freelancers?ordering=-rating_avg&limit=${PAGE}&offset=0`),
    serverApi<Category[]>("/categories"),
  ]);
  const items = data?.results ?? [];

  const itemList = items.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: items.map((f, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: absoluteUrl(`/freelancers/${f.id}`),
          name: f.name,
        })),
      }
    : null;

  return (
    <>
      {itemList && <JsonLd data={itemList} />}
      <FreelancersClient
        initialItems={items}
        initialCount={data?.count ?? 0}
        initialHasMore={Boolean(data?.next)}
        seeded={data !== null}
        categories={cats ?? []}
      />
    </>
  );
}

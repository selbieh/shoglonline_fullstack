import { JsonLd, serverApi, absoluteUrl } from "@/lib/seo";
import ServicesClient, { type Service, type Category } from "./ServicesClient";

/* Server-rendered services listing (SEO): page 1 + the category tree are fetched here so crawlers
   get real HTML and an ItemList; ServicesClient takes over for filters/search/load-more. Metadata
   lives in ./layout.tsx. */

const PAGE = 12;
export const revalidate = 60;

type ServicePage = { count?: number; next?: string | null; results?: Service[] };

export default async function ServicesPage() {
  const [data, cats] = await Promise.all([
    serverApi<ServicePage>(`/services?ordering=-published_at&limit=${PAGE}&offset=0`),
    serverApi<Category[]>("/categories"),
  ]);
  const items = data?.results ?? [];

  const itemList = items.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: items.map((s, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: absoluteUrl(`/services/${s.slug}`),
          name: s.title,
        })),
      }
    : null;

  return (
    <>
      {itemList && <JsonLd data={itemList} />}
      <ServicesClient
        initialItems={items}
        initialCount={data?.count ?? 0}
        initialHasMore={Boolean(data?.next)}
        seeded={data !== null}
        categories={cats ?? []}
      />
    </>
  );
}

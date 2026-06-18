import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment } from "@/lib/seo";
import { ClockIcon, HeartIcon, UserIcon } from "@/components/icons";
import BuyBox, { type Addon } from "./BuyBox";

/* Server-rendered service detail (SEO): content + metadata + Product/Offer JSON-LD.
   Favourite + buy box is a client island. */

type Service = {
  id: number;
  title: string;
  slug: string;
  description: string;
  base_price: string;
  delivery_days: number;
  worker_name: string;
  favorites_count: number;
  addons: Addon[];
};

async function getService(slug: string): Promise<Service | null> {
  return serverApi<Service>(`/services/${encodeSegment(slug)}`, 60);
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const s = await getService(params.slug);
  if (!s) return { title: "خدمة غير موجودة" };
  const description = (s.description || "").slice(0, 160);
  return {
    title: s.title,
    description,
    alternates: { canonical: `/services/${s.slug}` },
    openGraph: { type: "article", title: s.title, description, url: `${SITE_URL}/services/${s.slug}` },
    twitter: { card: "summary", title: s.title, description },
  };
}

export default async function ServiceDetailPage({ params }: { params: { slug: string } }) {
  const s = await getService(params.slug);
  if (!s) notFound();

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: s.title,
    description: s.description,
    offers: {
      "@type": "Offer",
      price: s.base_price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/services/${s.slug}`,
    },
  };

  return (
    <main>
      <JsonLd data={jsonLd} />
      {/* gradient hero band */}
      <section className="bg-hero text-white">
        <div className="mx-auto max-w-3xl px-6 pb-10 pt-8">
          <a href="/services" className="text-sm text-tint hover:underline">← كل الخدمات</a>
          <h1 className="mt-3 text-3xl font-extrabold drop-shadow-sm">{s.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1"><UserIcon className="text-[15px]" /> {s.worker_name}</span>
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1"><ClockIcon className="text-[15px]" /> {s.delivery_days} يوم</span>
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1"><HeartIcon className="text-[15px]" /> {s.favorites_count}</span>
            <span className="glass px-3 py-1" dir="ltr">من ${s.base_price}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-6 max-w-3xl px-6 pb-12">
        <section className="card">
          <h2 className="mb-3 font-bold gradient-text">عن الخدمة</h2>
          <p className="whitespace-pre-wrap text-sm leading-7 text-primary-deep">{s.description}</p>
        </section>

        <div className="mt-4">
          <BuyBox service={{ id: s.id, base_price: s.base_price, addons: s.addons }} />
        </div>
      </div>
    </main>
  );
}

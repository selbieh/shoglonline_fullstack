import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment } from "@/lib/seo";
import { BarChartIcon, ClipboardIcon, ClockIcon, GridIcon, HeartIcon, UserIcon } from "@/components/icons";
import MediaGallery from "@/components/MediaGallery";
import { DetailRail, RailRow } from "@/components/DetailRail";
import OwnerCard from "@/components/OwnerCard";
import StarRating from "@/components/StarRating";
import ReviewCard, { type ReviewData } from "@/components/ReviewCard";
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
  worker: number;
  worker_name: string;
  favorites_count: number;
  cover_image?: string;
  category_name?: string;
  keywords?: string[];
  what_you_get?: string;
  addons: Addon[];
  views_count?: number;
  purchases_count?: number;
  worker_avatar?: string;
  worker_rating?: number;
  worker_rating_count?: number;
  worker_verified?: boolean;
  reviews?: ReviewData[];
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
    <main className="bg-bg">
      <JsonLd data={jsonLd} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-sub" aria-label="مسار التنقل">
          <a href="/" className="hover:text-primary-dark">الرئيسية</a>
          <span aria-hidden>/</span>
          <a href="/services" className="hover:text-primary-dark">الخدمات</a>
          <span aria-hidden>/</span>
          <span className="truncate font-medium text-ink">{s.title}</span>
        </nav>

        <h1 className="mt-4 text-2xl font-extrabold md:text-3xl">{s.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-sub">
          <span className="inline-flex items-center gap-1.5"><UserIcon className="text-[15px] text-primary" /> {s.worker_name}</span>
          {s.worker_rating != null && s.worker_rating > 0 && (
            <StarRating value={s.worker_rating} count={s.worker_rating_count} />
          )}
          <span className="inline-flex items-center gap-1.5"><ClockIcon className="text-[15px] text-primary" /> {s.delivery_days.toLocaleString("ar-EG")} يوم</span>
          <span className="inline-flex items-center gap-1.5"><HeartIcon className="text-[15px] text-danger" /> {s.favorites_count.toLocaleString("ar-EG")}</span>
          {s.category_name && <span className="chip bg-tint text-primary-dark">{s.category_name}</span>}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* main */}
          <div className="min-w-0 space-y-6">
            <MediaGallery images={[s.cover_image].filter(Boolean) as string[]} alt={s.title} />

            <section className="card">
              <h2 className="mb-3 text-lg font-extrabold text-ink">وصف الخدمة</h2>
              <p className="whitespace-pre-wrap text-sm leading-7 text-ink/80">{s.description}</p>
            </section>

            {s.what_you_get && (
              <section className="card">
                <h2 className="mb-3 text-lg font-extrabold text-ink">ماذا ستحصل عليه</h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-ink/80">{s.what_you_get}</p>
              </section>
            )}

            {s.keywords && s.keywords.length > 0 && (
              <section className="card">
                <h2 className="mb-3 text-lg font-extrabold text-ink">كلمات مفتاحية</h2>
                <div className="flex flex-wrap gap-2">
                  {s.keywords.map((k) => <span key={k} className="rounded-full bg-tint px-3 py-1.5 text-sm font-medium text-primary-dark">{k}</span>)}
                </div>
              </section>
            )}

            {s.reviews && s.reviews.length > 0 && (
              <section className="card">
                <h2 className="mb-4 text-lg font-extrabold text-ink">
                  آراء المشترين {s.worker_rating_count ? <span className="text-sm font-normal text-sub">({s.worker_rating_count.toLocaleString("ar-EG")})</span> : null}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {s.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
                </div>
              </section>
            )}
          </div>

          {/* sidebar: buy box + service info + freelancer card */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <BuyBox service={{ id: s.id, base_price: s.base_price, addons: s.addons }} />

            <DetailRail title="معلومات الخدمة">
              <RailRow icon={<ClockIcon />} label="مدة التسليم" value={`${s.delivery_days.toLocaleString("ar-EG")} يوم`} />
              {s.category_name && <RailRow icon={<GridIcon />} label="التصنيف" value={s.category_name} />}
              {s.purchases_count != null && <RailRow icon={<ClipboardIcon />} label="مرات الشراء" value={s.purchases_count.toLocaleString("ar-EG")} />}
              {s.views_count != null && <RailRow icon={<BarChartIcon />} label="عدد المشاهدات" value={s.views_count.toLocaleString("ar-EG")} />}
              <RailRow icon={<HeartIcon />} label="الإعجابات" value={s.favorites_count.toLocaleString("ar-EG")} />
            </DetailRail>

            <OwnerCard
              title="صاحب الخدمة"
              name={s.worker_name}
              avatarUrl={s.worker_avatar}
              verified={s.worker_verified}
              rating={s.worker_rating}
              ratingCount={s.worker_rating_count}
              profileHref={`/freelancers/${s.worker}`}
              profileLabel="عرض الملف الشخصي"
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

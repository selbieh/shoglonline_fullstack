import type { ReactNode } from "react";
import { BarChartIcon, ClipboardIcon, ClockIcon, GridIcon, HeartIcon, UserIcon } from "@/components/icons";
import MediaGallery from "@/components/MediaGallery";
import { DetailRail, RailRow } from "@/components/DetailRail";
import OwnerCard from "@/components/OwnerCard";
import StarRating from "@/components/StarRating";
import ReviewCard, { type ReviewData } from "@/components/ReviewCard";
import type { Addon } from "@/app/services/[slug]/BuyBox";

/* Presentational buyer-facing service detail (ppt slide-21), shared by the public SSR page
   (/services/[slug]) and the owner's authed preview (/me/services/[id]/preview). The interactive
   pieces — buy box, favourite, report — are passed in as slots so the preview can swap in disabled
   stubs while reusing the exact same layout the buyer sees. */

export type ServiceDetail = {
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
  meta_title?: string;
  meta_description?: string;
};

export default function ServiceDetailView({
  s,
  buyBox,
  headerSlot,
  titleActions,
}: {
  s: ServiceDetail;
  /** The order/buy area in the sidebar — the public page passes <BuyBox>, the preview a disabled stub. */
  buyBox: ReactNode;
  /** Full-width banner rendered above the content (used by the owner preview). */
  headerSlot?: ReactNode;
  /** Inline actions next to the title (the public page's report button). */
  titleActions?: ReactNode;
}) {
  return (
    <main className="bg-bg">
      {headerSlot}
      <div className="mx-auto max-w-screen-2xl px-6 py-8">
        {/* breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-sub" aria-label="مسار التنقل">
          <a href="/" className="hover:text-primary-dark">الرئيسية</a>
          <span aria-hidden>/</span>
          <a href="/services" className="hover:text-primary-dark">الخدمات</a>
          <span aria-hidden>/</span>
          <span className="truncate font-medium text-ink">{s.title}</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-extrabold md:text-3xl">{s.title}</h1>
          {titleActions}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-sub">
          <span className="inline-flex items-center gap-1.5"><UserIcon className="text-[15px] text-primary" /> {s.worker_name}</span>
          {s.worker_rating != null && s.worker_rating > 0 && (
            <StarRating value={s.worker_rating} count={s.worker_rating_count} />
          )}
          <span className="inline-flex items-center gap-1.5"><ClockIcon className="text-[15px] text-primary" /> {s.delivery_days.toLocaleString("en-US")} يوم</span>
          <span className="inline-flex items-center gap-1.5"><HeartIcon className="text-[15px] text-danger" /> {s.favorites_count.toLocaleString("en-US")}</span>
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
                  آراء المشترين {s.worker_rating_count ? <span className="text-sm font-normal text-sub">({s.worker_rating_count.toLocaleString("en-US")})</span> : null}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {s.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
                </div>
              </section>
            )}
          </div>

          {/* sidebar: buy box + service info + freelancer card */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {buyBox}

            <DetailRail title="معلومات الخدمة">
              <RailRow icon={<ClockIcon />} label="مدة التسليم" value={`${s.delivery_days.toLocaleString("en-US")} يوم`} />
              {s.category_name && <RailRow icon={<GridIcon />} label="التصنيف" value={s.category_name} />}
              {s.purchases_count != null && <RailRow icon={<ClipboardIcon />} label="مرات الشراء" value={s.purchases_count.toLocaleString("en-US")} />}
              {s.views_count != null && <RailRow icon={<BarChartIcon />} label="عدد المشاهدات" value={s.views_count.toLocaleString("en-US")} />}
              <RailRow icon={<HeartIcon />} label="الإعجابات" value={s.favorites_count.toLocaleString("en-US")} />
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

import { StarIcon } from "@/components/icons";
import { formatUSD } from "@/lib/currency";

/* Service offer card (ppt slides 11/12/17/18 grids). Cover with hover-zoom + gradient fallback,
   title, 2-line description, delivery + rating footer, "يبدأ من" price, and a «عرض الخدمة» button —
   matching the deck's service-grid card. Server-renderable. */

export type ServiceCardData = {
  id: number;
  title: string;
  slug: string;
  base_price: string;
  delivery_days: number;
  cover_image?: string;
  description?: string;
  rating?: number | null;
  rating_count?: number;
};

export default function ServiceCard({ service }: { service: ServiceCardData }) {
  const s = service;
  const href = `/services/${s.slug}`;
  return (
    <div className="card-modern group flex flex-col overflow-hidden">
      <a href={href} className="block">
        <div className="relative aspect-video overflow-hidden bg-tint">
          {s.cover_image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={s.cover_image} alt={s.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
            : <div className="cover-c h-full w-full" />}
        </div>
      </a>
      <div className="flex flex-1 flex-col p-4">
        <a href={href} className="line-clamp-1 font-bold text-ink transition group-hover:text-primary-dark">{s.title}</a>
        {s.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-sub">{s.description}</p>}

        <div className="mt-3 flex items-center justify-between text-xs text-sub">
          <span>{s.delivery_days.toLocaleString("en-US")} أيام</span>
          {s.rating != null && s.rating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-star" dir="ltr">
              <StarIcon filled className="text-[12px]" />
              <span className="font-bold text-ink">{s.rating.toFixed(1)}</span>
              {s.rating_count ? <span className="text-sub"> ({s.rating_count.toLocaleString("en-US")})</span> : null}
            </span>
          )}
        </div>

        <p className="mt-1 text-sm">
          <span className="text-sub">يبدأ من </span>
          <span className="font-extrabold text-primary">{formatUSD(s.base_price)}</span>
        </p>

        <a href={href} className="mt-3 inline-flex w-full items-center justify-center rounded-m border border-primary/30 px-3 py-2 text-sm font-bold text-primary-dark transition hover:bg-primary hover:text-white">
          عرض الخدمة
        </a>
      </div>
    </div>
  );
}

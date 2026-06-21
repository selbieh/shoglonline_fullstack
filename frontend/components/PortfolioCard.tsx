import { GridIcon } from "@/components/icons";

/* Portfolio work tile (ppt slides 12/22 «سابقة الأعمال / أعمال مشابهة»). Thumbnail (hover-zoom +
   gradient fallback) + title + a «عرض المشروع» link to the work-showcase page. Server-renderable. */

export type PortfolioCardData = {
  id: number;
  title: string;
  media_type?: string;
  url?: string;
  cover_url?: string;
  image_url?: string;
};

export default function PortfolioCard({ item, href }: { item: PortfolioCardData; href: string }) {
  const thumb = item.media_type === "image" ? item.image_url || item.url : item.cover_url || item.image_url;
  return (
    <div className="card-modern group block overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-tint">
        {thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={thumb} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
          : <div className="cover-c flex h-full w-full items-center justify-center text-white/90"><GridIcon className="text-3xl" /></div>}
      </div>
      <div className="p-3.5">
        <p className="truncate text-sm font-bold text-ink">{item.title}</p>
        <a href={href} className="mt-2 inline-flex w-full items-center justify-center rounded-m border border-primary bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white hover:text-primary-dark">
          عرض المشروع
        </a>
      </div>
    </div>
  );
}

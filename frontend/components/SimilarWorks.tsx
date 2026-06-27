"use client";

import { useRef, useState } from "react";
import { StarIcon } from "@/components/icons";

/* Horizontal "similar works / services" carousel (ppt slides 20/21/22 «أعمال مشابهة / خدمات مشابهة»).
   Scrollable card row with prev/next controls; each card = thumbnail + title + author + rating. */

export type SimilarWork = {
  id: number;
  title: string;
  thumb?: string;
  author?: string;
  rating?: number | null;
  href: string;
};

function Thumb({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={title} className="aspect-video w-full bg-tint object-cover"
        onError={() => setFailed(true)} />
    );
  }
  return (
    <div aria-hidden
      className="relative grid aspect-video w-full place-content-center overflow-hidden bg-gradient-to-br from-tint via-white to-tint">
      <span className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" className="relative text-primary/50">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="8.5" cy="9.5" r="1.8" />
        <path d="M21 16l-5-5-7 7" />
      </svg>
    </div>
  );
}

export default function SimilarWorks({ items }: { items: SimilarWork[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!items || items.length === 0) return null;
  const scroll = (d: number) => ref.current?.scrollBy({ left: d, behavior: "smooth" });

  return (
    <div className="relative">
      <div ref={ref} className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none]">
        {items.map((w) => (
          <a key={w.id} href={w.href}
            className="group w-52 shrink-0 overflow-hidden rounded-l border border-line bg-white transition hover:shadow-card">
            <Thumb src={w.thumb} title={w.title} />
            <div className="p-3">
              <p className="truncate text-sm font-bold text-ink transition group-hover:text-primary-dark">{w.title}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-sub">
                {w.author ? <span className="truncate">{w.author}</span> : <span />}
                {w.rating != null && w.rating > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-star" dir="ltr">
                    <StarIcon filled className="text-[13px]" /> <span className="text-ink">{w.rating.toFixed(1)}</span>
                  </span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
      {items.length > 3 && (
        <>
          <button type="button" onClick={() => scroll(240)} aria-label="السابق"
            className="absolute right-0 top-[38%] grid h-9 w-9 -translate-y-1/2 place-content-center rounded-full bg-white text-lg text-ink shadow-card transition hover:bg-tint">‹</button>
          <button type="button" onClick={() => scroll(-240)} aria-label="التالي"
            className="absolute left-0 top-[38%] grid h-9 w-9 -translate-y-1/2 place-content-center rounded-full bg-white text-lg text-ink shadow-card transition hover:bg-tint">›</button>
        </>
      )}
    </div>
  );
}

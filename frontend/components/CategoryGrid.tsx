"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { CategoryIcon, categoryTone } from "@/components/CategoryIcon";
import { ArrowLeftIcon } from "@/components/icons";

export type Cat = { id: number; slug: string; name_ar: string; icon: string };
type Item = { slug?: string; icon?: string; title: string; link: string };

/**
 * Resilient category grid — modern line-icons + soft coloured tiles.
 * - Renders the SSR-provided categories first (good for SEO + the docker setup).
 * - On mount, re-fetches from the browser-reachable API and self-heals if SSR
 *   returned nothing (e.g. running `npm run dev` outside docker, where the
 *   server-side internal hostname `backend:8000` isn't resolvable).
 * - Links always carry the category slug → `/jobs?category=<slug>`.
 */
export default function CategoryGrid({
  initial,
  fallback,
}: {
  initial: Cat[];
  fallback: Item[];
}) {
  const [cats, setCats] = useState<Cat[]>(initial);

  useEffect(() => {
    if (cats.length) return; // SSR already gave us real data
    fetch(`${API_URL}/categories`)
      .then(async (r) => (r.ok ? ((await r.json()) as Cat[]) : []))
      .then((data) => Array.isArray(data) && data.length && setCats(data))
      .catch(() => undefined);
  }, [cats.length]);

  const items: Item[] = cats.length
    ? cats.map((c) => ({ slug: c.slug, icon: c.icon, title: c.name_ar, link: `/jobs?category=${c.slug}` }))
    : fallback;

  return (
    <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((c, i) => (
        <Link key={i} href={c.link} className="card-modern group flex items-center gap-3 p-4">
          <span className={`icon-tile h-12 w-12 shrink-0 text-[22px] transition duration-300 group-hover:scale-105 ${categoryTone(c.slug)}`}>
            <CategoryIcon icon={c.icon} slug={c.slug} />
          </span>
          <span className="line-clamp-2 min-w-0 flex-1 font-bold leading-snug text-ink transition group-hover:text-primary-deep">
            {c.title}
          </span>
          {/* arrow only on ≥sm: on phones it has no hover state and would steal width from the label */}
          <ArrowLeftIcon className="hidden shrink-0 text-[16px] text-primary opacity-0 transition duration-300 group-hover:opacity-100 sm:block" />
        </Link>
      ))}
    </div>
  );
}

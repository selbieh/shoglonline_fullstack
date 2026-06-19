"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { tagTone } from "@/lib/tags";
import { ArrowLeftIcon, HeartIcon, SparklesIcon } from "@/components/icons";
import StatusTabs from "@/components/StatusTabs";

/* Favourites across all four kinds (ppt slide-43). Services use the dedicated ServiceFavorite
   table; jobs / freelancers / portfolio use the generic Favorite. Each tab fetches its own list. */

const TABS = [
  { value: "services", label: "الخدمات" },
  { value: "freelancers", label: "المستقلون" },
  { value: "jobs", label: "الوظائف" },
  { value: "portfolio", label: "معرض الأعمال" },
];
// tab (plural, UI) → backend kind (singular)
const KIND: Record<string, string> = { services: "service", freelancers: "freelancer", jobs: "job", portfolio: "portfolio" };

/** Broad shape — only the fields relevant to the active tab are populated. */
type FavItem = {
  id: number;
  // service / job
  title?: string; slug?: string; description?: string; base_price?: string; category_name?: string;
  cover_image?: string; worker_name?: string;
  // job
  budget_min?: string; budget_max?: string;
  // freelancer (id = user id)
  name?: string; avatar_url?: string; bio_title?: string; rating_avg?: number;
  // portfolio
  image_url?: string; cover_url?: string;
};

export default function MyFavoritesPage() {
  const router = useRouter();
  const [tab, setTab] = useState("services");
  const [items, setItems] = useState<FavItem[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (t: string) => {
    setItems(null);
    const kind = KIND[t];
    const url = kind === "service" ? "/me/favorites" : `/me/favorites?kind=${kind}`;
    setItems(await api<FavItem[]>(url));
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load(tab).catch(() => router.replace(signinHereHref()));
  }, [tab, load, router]);

  async function remove(id: number) {
    setBusyId(id);
    const prev = items;
    setItems((l) => l?.filter((x) => x.id !== id) ?? null);
    const kind = KIND[tab];
    const url = kind === "service" ? `/me/favorites/${id}` : `/me/favorites/${kind}/${id}`;
    try {
      await api(url, { method: "DELETE" });
    } catch {
      setItems(prev);
    } finally {
      setBusyId(null);
    }
  }

  function hrefFor(it: FavItem): string | null {
    if (tab === "services") return `/services/${it.slug}`;
    if (tab === "jobs") return `/jobs/${it.slug}`;
    if (tab === "freelancers") return `/freelancers/${it.id}`;
    return null; // portfolio favourites have no standalone owner link here
  }

  function thumbFor(it: FavItem): string | undefined {
    return it.cover_image || it.image_url || it.cover_url || it.avatar_url || undefined;
  }

  function titleFor(it: FavItem): string {
    return it.title || it.name || "—";
  }

  function subtitleFor(it: FavItem): string {
    if (tab === "services") return it.worker_name || "";
    if (tab === "freelancers") return it.bio_title || "";
    if (tab === "jobs") return [it.budget_min, it.budget_max].filter(Boolean).join(" – ");
    return "";
  }

  const EMPTY: Record<string, { text: string; cta?: { href: string; label: string } }> = {
    services: { text: "لا خدمات في المفضلة بعد", cta: { href: "/services", label: "تصفّح الخدمات" } },
    freelancers: { text: "لا مستقلين في المفضلة بعد", cta: { href: "/freelancers", label: "تصفّح المستقلين" } },
    jobs: { text: "لا وظائف في المفضلة بعد", cta: { href: "/jobs", label: "تصفّح الوظائف" } },
    portfolio: { text: "لا أعمال محفوظة بعد" },
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl font-extrabold">
          <HeartIcon filled className="text-[26px] text-danger" /> المفضلة
        </h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>
      <p className="mt-1 text-sm text-sub">احفظ ما يعجبك للرجوع إليه لاحقًا: خدمات، مستقلون، وظائف، أو أعمال.</p>

      <div className="mt-5">
        <StatusTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {items === null ? (
        <ul className="mt-6 space-y-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="card-modern animate-pulse p-5">
              <div className="h-5 w-2/3 rounded bg-line" />
              <div className="mt-3 h-4 w-1/3 rounded bg-line" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="card mt-6 py-14 text-center text-sub">
          <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-danger-t text-[26px] text-danger">
            <HeartIcon />
          </div>
          <p className="mt-3 font-bold">{EMPTY[tab].text}</p>
          {EMPTY[tab].cta && (
            <a href={EMPTY[tab].cta!.href} className="btn-secondary mt-4 inline-block text-sm">{EMPTY[tab].cta!.label}</a>
          )}
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((it) => {
            const href = hrefFor(it);
            const thumb = thumbFor(it);
            const title = titleFor(it);
            const sub = subtitleFor(it);
            return (
              <li key={it.id} className="card-modern p-5">
                <div className="flex items-start gap-4">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" loading="lazy"
                      className={`h-16 w-16 shrink-0 object-cover ring-1 ring-line sm:h-20 sm:w-20 ${tab === "freelancers" ? "rounded-full" : "rounded-m"}`} />
                  ) : (
                    <div className="icon-tile h-16 w-16 shrink-0 text-[26px] sm:h-20 sm:w-20"><SparklesIcon /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    {href ? (
                      <Link href={href} className="text-lg font-bold leading-snug transition hover:text-primary-dark">{title}</Link>
                    ) : (
                      <span className="text-lg font-bold leading-snug">{title}</span>
                    )}
                    {sub && <p className="mt-1 text-sm text-sub">{sub}</p>}
                    {tab === "freelancers" && it.rating_avg != null && (
                      <p className="mt-1 text-xs text-sub">التقييم: {Number(it.rating_avg).toLocaleString("ar-EG")}</p>
                    )}
                    {it.category_name && (
                      <div className="mt-2.5"><span className={`tag-soft ${tagTone(it.category_name)}`}>{it.category_name}</span></div>
                    )}
                    {it.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-sub">{it.description}</p>}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3.5">
                  {tab === "services" && it.base_price ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="text-[11px] text-sub">يبدأ من</span>
                      <span className="text-xl font-extrabold text-primary" dir="ltr">${it.base_price}</span>
                    </span>
                  ) : <span />}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => remove(it.id)} disabled={busyId === it.id}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-danger transition hover:bg-danger-t disabled:opacity-50"
                      aria-label="إزالة من المفضلة">
                      <HeartIcon filled className="text-[16px]" />
                      {busyId === it.id ? "جارٍ الإزالة…" : "إزالة"}
                    </button>
                    {href && (
                      <Link href={href} className="btn-primary group/btn gap-1.5 px-4 py-1.5 text-sm">
                        عرض
                        <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

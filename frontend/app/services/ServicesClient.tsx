"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { AlertIcon, ArrowLeftIcon, ClockIcon, HeartIcon, SearchIcon } from "@/components/icons";
import { CategoryIcon } from "@/components/CategoryIcon";
import CategoryFilter from "@/components/CategoryFilter";
import FilterPanel from "@/components/FilterPanel";
import CardActions from "@/components/CardActions";
import { ServiceThumb } from "@/components/ServiceCover";
import { useFavoriteIds } from "@/lib/useFavoriteIds";
import { formatUSD } from "@/lib/currency";

export type Service = {
  id: number;
  title: string;
  slug: string;
  description?: string;
  base_price: string;
  delivery_days: number;
  cover_image?: string;
  category_name?: string;
  category_slug?: string;
  worker_name: string;
  favorites_count: number;
  created_at?: string;
};
export type Category = { id: number; slug: string; name_ar: string; icon: string; children: Category[] };
type ServicePage = { count?: number; next?: string | null; results?: Service[] };

const PAGE = 12; // load-more page size (server caps limit at 100)

/* Client island for /services. The server component (page.tsx) fetches page 1 + the category tree
   and seeds this via props, so the first paint is real SSR HTML (good for SEO); filters, search and
   load-more run on the client from there. */
export default function ServicesClient({
  initialItems, initialCount, initialHasMore, seeded, categories,
}: {
  initialItems: Service[];
  initialCount: number;
  initialHasMore: boolean;
  seeded: boolean;
  categories: Category[];
}) {
  const [items, setItems] = useState<Service[]>(initialItems);
  const [count, setCount] = useState(initialCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(!seeded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [q, setQ] = useState("");
  const [ordering, setOrdering] = useState("-published_at");
  const favIds = useFavoriteIds("service"); // pre-fill hearts for items the user already saved

  const subcats = categories.find((c) => String(c.id) === category)?.children ?? [];
  const activeCat = categories.find((c) => String(c.id) === category);
  const activeSub = subcats.find((c) => String(c.id) === subcategory);

  // Paginated fetch — offset 0 replaces the list; a positive offset appends the next page.
  const load = useCallback(
    async (offset: number) => {
      const append = offset > 0;
      append ? setLoadingMore(true) : setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ ordering, limit: String(PAGE), offset: String(offset) });
        if (category) params.set("category", category);
        if (subcategory) params.set("subcategory", subcategory);
        if (q) params.set("search", q);
        const res = await fetch(`${API_URL}/services?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ServicePage;
        const results = Array.isArray(data?.results) ? data.results : [];
        setItems((prev) => (append ? [...prev, ...results] : results));
        setCount(data?.count ?? 0);
        setHasMore(Boolean(data?.next));
      } catch {
        setError(true);
        if (!append) {
          setItems([]);
          setCount(0);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, subcategory, q, ordering],
  );

  // Refetch when a filter/sort changes — but skip the very first run when the server already
  // seeded the default list (avoids a redundant fetch + content flash on load).
  const loadMounted = useRef(false);
  useEffect(() => {
    if (!loadMounted.current) {
      loadMounted.current = true;
      if (seeded) return;
    }
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, subcategory, ordering]);
  // Live search: debounced auto-apply (consistent with the category/sort filters).
  const qMounted = useRef(false);
  useEffect(() => {
    if (!qMounted.current) {
      qMounted.current = true;
      return;
    }
    const t = setTimeout(() => load(0), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function pickCategory(id: string) {
    setCategory(id);
    setSubcategory("");
  }
  function clearFilters() {
    setCategory("");
    setSubcategory("");
    setQ("");
  }

  return (
    <main className="min-h-screen bg-bg">
      {/* gradient header band */}
      <section className="bg-hero bg-spotlight relative overflow-hidden text-white">
        <div className="dots pointer-events-none absolute inset-0 opacity-[0.10]" aria-hidden />
        <div className="relative mx-auto flex max-w-screen-2xl flex-wrap items-end justify-between gap-4 px-6 pb-10 pt-10">
          <div>
            <span className="glass animate-fade-up mb-3 inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_2px_rgba(27,138,90,0.45)]" />
              سوق الخدمات الجاهزة
            </span>
            <h1 className="animate-fade-up delay-100 text-3xl font-extrabold drop-shadow-sm md:text-4xl">الخدمات الخاصة</h1>
            <p className="animate-fade-up delay-200 mt-2 text-tint">
              {loading ? "جارٍ التحميل…" : `${count.toLocaleString("en-US")} خدمة جاهزة بسعر ثابت — اطلبها واشترِها مباشرة.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="seg">
              {[
                { v: "-published_at", l: "الأحدث" },
                { v: "base_price", l: "الأرخص" },
                { v: "-base_price", l: "الأغلى" },
                { v: "-favorites_count", l: "الأكثر تفضيلًا" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setOrdering(o.v)}
                  className={`seg-item ${ordering === o.v ? "seg-item-active" : ""}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <Link href="/me/services" className="btn bg-white text-primary-dark shadow-glow hover:bg-tint">
              خدماتي ←
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 pb-14 pt-6 lg:flex-row">
        <div className="flex-1 space-y-4 lg:min-h-screen">
          {/* active filters bar */}
          {(activeCat || activeSub || q) && (
            <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="text-sm font-bold text-ink">الفلاتر النشطة</span>
              {activeCat && (
                <button onClick={() => pickCategory("")} className="chip-removable" title="إزالة الفلتر">
                  <CategoryIcon slug={activeCat.slug} className="text-[14px]" /> {activeCat.name_ar}
                  <span className="chip-x" aria-hidden>✕</span>
                </button>
              )}
              {activeSub && (
                <button onClick={() => setSubcategory("")} className="chip-removable" title="إزالة الفلتر">
                  {activeSub.name_ar}
                  <span className="chip-x" aria-hidden>✕</span>
                </button>
              )}
              {q && (
                <button onClick={() => setQ("")} className="chip-removable" title="إزالة البحث">
                  <SearchIcon className="text-[13px]" /> {q}
                  <span className="chip-x" aria-hidden>✕</span>
                </button>
              )}
              <button onClick={clearFilters} className="btn-ghost ms-auto" aria-label="مسح كل الفلاتر">
                <span aria-hidden>✕</span> مسح الكل
              </button>
            </div>
          )}

          {/* loading skeletons */}
          {loading && (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card-modern animate-pulse overflow-hidden">
                  <div className="aspect-video w-full bg-line" />
                  <div className="space-y-2 p-4">
                    <div className="h-5 w-3/4 rounded bg-line" />
                    <div className="h-3 w-1/3 rounded bg-line" />
                    <div className="h-3 w-full rounded bg-line" />
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                      <div className="h-6 w-24 rounded bg-line" />
                      <div className="h-8 w-24 rounded-full bg-line" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* error state */}
          {!loading && error && (
            <div className="card py-14 text-center">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-warn-t text-[26px] text-warn"><AlertIcon /></div>
              <p className="mt-3 font-bold">تعذّر تحميل الخدمات</p>
              <p className="text-sm text-sub">تحقّق من اتصالك ثم حاول مجددًا</p>
              <button onClick={() => load(0)} className="btn-secondary mt-4 text-sm">إعادة المحاولة</button>
            </div>
          )}

          {/* results — gallery-style grid: big 16:9 cover (or a branded per-category cover
              when the seller uploaded none), then identity, meta and the order CTA */}
          {!loading && !error && items.length > 0 && (
            <div className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((s) => {
                  const posted = timeAgo(s.created_at);
                  const href = `/services/${s.slug}`;
                  return (
                  <Link key={s.id} href={href} className="card-modern group flex flex-col overflow-hidden">
                    <div className="relative aspect-video overflow-hidden bg-tint">
                      <ServiceThumb cover={s.cover_image} slug={s.category_slug} alt={s.title} />
                      {/* category on the cover where it has the full width to show in full */}
                      {s.category_name && (
                        <span className="absolute start-2 top-2 inline-flex max-w-[75%] items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-primary-dark shadow-sm backdrop-blur">
                          <CategoryIcon slug={s.category_slug} className="shrink-0 text-[12px]" />
                          <span className="truncate">{s.category_name}</span>
                        </span>
                      )}
                      {/* report · save · share — overlaid on the cover */}
                      <CardActions
                        variant="overlay"
                        reportKind="service"
                        favoriteKind="service"
                        id={s.id}
                        favoriteInitial={favIds.has(s.id)}
                        shareUrl={href}
                        shareTitle={s.title}
                        className="absolute bottom-2 end-2 z-10"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      {/* title — up to two lines (height reserved so cards align) */}
                      <h3 className="line-clamp-2 min-h-[2.6rem] font-bold leading-snug text-ink transition group-hover:text-primary-dark">
                        {s.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-sub">
                        <span className="font-medium text-ink/75">{s.worker_name}</span>
                        {posted && (
                          <>
                            <span aria-hidden className="text-line-strong">•</span>
                            <span className="inline-flex items-center gap-1"><ClockIcon className="text-[13px]" /> {posted}</span>
                          </>
                        )}
                      </div>
                      {s.description && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-sub">{s.description}</p>
                      )}

                      {/* compact meta + price/CTA, pinned to the bottom so cards align */}
                      <div className="mt-auto pt-3">
                        <div className="flex items-center gap-4 border-t border-line pt-3 text-xs text-sub">
                          <span className="inline-flex items-center gap-1" title="مدة التسليم">
                            <ClockIcon className="text-[14px] text-primary" />
                            <span className="font-bold text-ink">{s.delivery_days.toLocaleString("en-US")}</span> يوم
                          </span>
                          <span className="inline-flex items-center gap-1" title="المفضلة">
                            <HeartIcon className="text-[14px] text-danger" />
                            <span className="font-bold text-ink">{s.favorites_count.toLocaleString("en-US")}</span>
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <p className="text-sm">
                            <span className="text-sub">يبدأ من </span>
                            <span className="font-extrabold text-primary">{formatUSD(s.base_price)}</span>
                          </p>
                          <span className="btn-soft group/btn gap-1.5 px-4 py-1.5 text-sm">
                            اطلب الخدمة
                            <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => load(items.length)}
                    disabled={loadingMore}
                    className="btn-secondary text-sm disabled:opacity-60"
                  >
                    {loadingMore ? "جارٍ التحميل…" : "عرض المزيد من الخدمات"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* empty state */}
          {!loading && !error && items.length === 0 && (
            <div className="card py-14 text-center text-sub">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-tint text-[26px] text-primary"><SearchIcon /></div>
              <p className="mt-3 font-bold">لا خدمات تطابق بحثك</p>
              <p className="text-sm">جرّب توسيع الفلاتر أو امسحها كلها</p>
              {(activeCat || activeSub || q) && (
                <button onClick={clearFilters} className="btn-secondary mt-4 text-sm">مسح الفلاتر</button>
              )}
            </div>
          )}
        </div>

        <FilterPanel activeCount={(activeCat ? 1 : 0) + (activeSub ? 1 : 0) + (q ? 1 : 0)}>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">تصفية النتائج</h3>
              {(activeCat || activeSub || q) && (
                <button onClick={clearFilters} className="btn-ghost" aria-label="مسح كل الفلاتر">
                  <span aria-hidden>✕</span> مسح
                </button>
              )}
            </div>
            <div className="relative">
              <input
                className="field pe-9"
                placeholder="ابحث عن خدمة…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(0)}
              />
              <button
                type="button"
                onClick={() => load(0)}
                aria-label="بحث"
                className="absolute inset-y-0 end-2 my-auto grid h-7 w-7 place-content-center text-[18px] text-sub transition hover:text-primary"
              >
                <SearchIcon />
              </button>
            </div>
            <CategoryFilter
              categories={categories}
              selectedId={subcategory || category}
              onSelect={(sel) => {
                if (!sel) {
                  setCategory("");
                  setSubcategory("");
                } else if (sel.parentId) {
                  setCategory(sel.parentId);
                  setSubcategory(sel.id);
                } else {
                  setCategory(sel.id);
                  setSubcategory("");
                }
              }}
            />
          </div>
        </FilterPanel>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { AlertIcon, ArrowLeftIcon, BriefcaseIcon, ClockIcon, HeartIcon, SearchIcon, SparklesIcon } from "@/components/icons";
import { CategoryIcon } from "@/components/CategoryIcon";
import CategoryFilter from "@/components/CategoryFilter";
import FilterPanel from "@/components/FilterPanel";
import CardActions from "@/components/CardActions";
import { useFavoriteIds } from "@/lib/useFavoriteIds";
import { ListingStat, ListingStats, ListingFooter } from "@/components/ListingCard";

export type Service = {
  id: number;
  title: string;
  slug: string;
  description?: string;
  base_price: string;
  delivery_days: number;
  cover_image?: string;
  category_name?: string;
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
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 pb-10 pt-10">
          <div>
            <span className="glass animate-fade-up mb-3 inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_2px_rgba(27,138,90,0.45)]" />
              سوق الخدمات الجاهزة
            </span>
            <h1 className="animate-fade-up delay-100 text-3xl font-extrabold drop-shadow-sm md:text-4xl">الخدمات الخاصة</h1>
            <p className="animate-fade-up delay-200 mt-2 text-tint">
              {loading ? "جارٍ التحميل…" : `${count.toLocaleString("ar-EG")} خدمة جاهزة بسعر ثابت — اطلبها واشترِها مباشرة.`}
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

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-14 pt-6 lg:flex-row">
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
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card-modern animate-pulse p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 shrink-0 rounded-m bg-line sm:h-20 sm:w-20" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-2/3 rounded bg-line" />
                      <div className="h-3 w-1/3 rounded bg-line" />
                      <div className="h-5 w-24 rounded-full bg-line" />
                      <div className="h-4 w-full rounded bg-line" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3.5">
                    <div className="h-6 w-28 rounded bg-line" />
                    <div className="h-8 w-28 rounded-full bg-line" />
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

          {/* results */}
          {!loading && !error && items.length > 0 && (
            <div className="space-y-4">
              {items.map((s) => {
                  const posted = timeAgo(s.created_at);
                  return (
                  <Link
                    key={s.id}
                    href={`/services/${s.slug}`}
                    className="card-modern group relative block p-5"
                  >
                    <div className="flex items-start gap-4">
                      {/* cover image as a clean thumbnail, else a soft icon tile */}
                      {s.cover_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.cover_image}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-m object-cover ring-1 ring-line sm:h-20 sm:w-20"
                          loading="lazy"
                        />
                      ) : (
                        <div className="icon-tile h-16 w-16 shrink-0 text-[26px] transition duration-300 group-hover:bg-primary group-hover:text-white sm:h-20 sm:w-20">
                          <SparklesIcon />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-lg font-bold leading-snug transition group-hover:text-primary-dark">
                            {s.title}
                          </h3>
                          <CardActions
                            reportKind="service"
                            favoriteKind="service"
                            id={s.id}
                            favoriteInitial={favIds.has(s.id)}
                            shareUrl={`/services/${s.slug}`}
                            shareTitle={s.title}
                          />
                        </div>
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
                          <p className="mt-3 line-clamp-2 text-sm leading-6 text-sub">{s.description}</p>
                        )}
                      </div>
                    </div>

                    {/* stats strip: delivery · category · favorites */}
                    <ListingStats>
                      <ListingStat icon={<ClockIcon />} label="مدة التسليم" value={`${s.delivery_days.toLocaleString("ar-EG")} يوم`} />
                      <ListingStat icon={<BriefcaseIcon />} label="الفئة" value={s.category_name || "—"} />
                      <ListingStat icon={<HeartIcon />} label="المفضلة" value={s.favorites_count.toLocaleString("ar-EG")} />
                    </ListingStats>

                    {/* footer: starting price + order CTA */}
                    <ListingFooter priceLabel="يبدأ من" priceValue={`$${s.base_price}`}>
                      <span className="btn-soft group/btn gap-1.5 px-4 py-1.5 text-sm">
                        اطلب الخدمة
                        <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
                      </span>
                    </ListingFooter>
                  </Link>
                  );
                })}
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { tagTone } from "@/lib/tags";
import { LOCATION_LABEL, type Category, type Job, type Paginated } from "@/lib/types";
import {
  AlertIcon, ArrowLeftIcon, BellIcon, BriefcaseIcon, ClockIcon, MapPinIcon,
  SearchIcon, UsersIcon,
} from "@/components/icons";
import { CategoryIcon } from "@/components/CategoryIcon";
import CardActions from "@/components/CardActions";
import { useFavoriteIds } from "@/lib/useFavoriteIds";
import CategoryFilter from "@/components/CategoryFilter";
import FilterPanel from "@/components/FilterPanel";
import { ListingStat, ListingStats, ListingFooter } from "@/components/ListingCard";
import SubscribeCategoryButton from "@/components/SubscribeCategoryButton";
import { formatUSDRange } from "@/lib/currency";

const PAGE = 12; // load-more page size (server caps limit at 100)

export type JobsFilters = { category: string; subcategory: string; q: string };

/* Client island for /jobs. The server component (page.tsx) reads the URL filters, fetches the
   matching first page + the category tree, and seeds this — so crawlers/visitors get real SSR HTML;
   filters/search/load-more run on the client from there. */
export default function JobsClient({
  initialItems, initialCount, initialHasMore, seeded, categories, initialFilters,
}: {
  initialItems: Job[];
  initialCount: number;
  initialHasMore: boolean;
  seeded: boolean;
  categories: Category[];
  initialFilters: JobsFilters;
}) {
  const [items, setItems] = useState<Job[]>(initialItems);
  const [count, setCount] = useState(initialCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(!seeded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<string>(initialFilters.category); // id OR slug (normalized below)
  const [subcategory, setSubcategory] = useState<string>(initialFilters.subcategory);
  const [q, setQ] = useState(initialFilters.q);
  const [ordering, setOrdering] = useState("-published_at");
  const favIds = useFavoriteIds("job"); // pre-fill hearts for items the user already saved
  const router = useRouter();
  const pathname = usePathname();

  // Mirror the active filters into the querystring so the view is shareable / back-button-friendly
  // (parity with /gallery). Defaults are omitted to keep links clean.
  const syncUrl = useCallback(() => {
    const sp = new URLSearchParams();
    if (ordering && ordering !== "-published_at") sp.set("ordering", ordering);
    if (category) sp.set("category", category);
    if (subcategory) sp.set("subcategory", subcategory);
    if (q) sp.set("search", q);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [ordering, category, subcategory, q, pathname, router]);

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
        const sp = new URLSearchParams({ ordering, limit: String(PAGE), offset: String(offset) });
        if (category) sp.set("category", category);
        if (subcategory) sp.set("subcategory", subcategory);
        if (q) sp.set("search", q);
        const res = await fetch(`${API_URL}/jobs?${sp}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Paginated<Job>;
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

  function pickCategory(id: string) {
    setCategory(id);
    setSubcategory(""); // reset sub-category when the parent changes
  }

  function clearFilters() {
    setCategory("");
    setSubcategory("");
    setQ("");
  }

  // Resolve a URL ?category= that arrived as a slug into the matching id (so the radio reflects it).
  // A child value reflects as parent radio + subcategory. Runs once — categories are seeded by SSR.
  useEffect(() => {
    if (!category || categories.length === 0) return;
    const match = (c: Category) => String(c.id) === category || c.slug === category;
    const top = categories.find(match);
    if (top) {
      if (String(top.id) !== category) setCategory(String(top.id)); // normalize slug → id
      return;
    }
    for (const parent of categories) {
      const child = parent.children?.find(match);
      if (child) {
        setSubcategory(String(child.id));
        setCategory(String(parent.id));
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);
  // Refetch on filter/sort change, skipping the first run when the server already seeded the list.
  const loadMounted = useRef(false);
  useEffect(() => {
    if (!loadMounted.current) {
      loadMounted.current = true;
      if (seeded) return;
    }
    syncUrl();
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, subcategory, ordering]);
  // Live search: debounce the free-text query so it applies automatically like the
  // category/sort filters — no manual "apply" button needed. Skips the initial mount.
  const qMounted = useRef(false);
  useEffect(() => {
    if (!qMounted.current) {
      qMounted.current = true;
      return;
    }
    const t = setTimeout(() => { syncUrl(); load(0); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <main className="min-h-screen bg-bg">
      {/* gradient header band */}
      <section className="bg-hero bg-spotlight relative overflow-hidden text-white">
        <div className="dots pointer-events-none absolute inset-0 opacity-[0.10]" aria-hidden />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 pb-10 pt-10">
          <div>
            <span className="glass animate-fade-up mb-3 inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_2px_rgba(27,138,90,0.45)]" />
              لوحة الوظائف
            </span>
            <h1 className="animate-fade-up delay-100 text-3xl font-extrabold drop-shadow-sm md:text-4xl">الوظائف</h1>
            <p className="animate-fade-up delay-200 mt-2 text-tint">
              {loading ? "جارٍ التحميل…" : `${count.toLocaleString("en-US")} وظيفة متاحة الآن`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="seg">
              {[
                { v: "-published_at", l: "الأحدث" },
                { v: "-budget_max", l: "الأعلى ميزانية" },
                { v: "proposals_count", l: "الأقل منافسة" },
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
            <Link href="/jobs/new" className="btn bg-white text-primary-dark shadow-glow hover:bg-tint">
              + نشر وظيفة
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
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card-modern animate-pulse p-5">
                <div className="flex items-start gap-4">
                  <div className="hidden h-12 w-12 shrink-0 rounded-m bg-line sm:block" />
                  <div className="flex-1">
                    <div className="h-5 w-2/3 rounded bg-line" />
                    <div className="mt-2 h-3 w-1/3 rounded bg-line" />
                    <div className="mt-3 h-4 w-full rounded bg-line" />
                    <div className="mt-2 h-4 w-1/2 rounded bg-line" />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4 rounded-m bg-bg px-4 py-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="space-y-1.5">
                      <div className="h-3 w-16 rounded bg-line" />
                      <div className="h-4 w-12 rounded bg-line" />
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
                  <div className="h-6 w-24 rounded bg-line" />
                  <div className="h-8 w-28 rounded-full bg-line" />
                </div>
              </div>
            ))}

          {/* error state */}
          {!loading && error && (
            <div className="card py-14 text-center">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-warn-t text-[26px] text-warn"><AlertIcon /></div>
              <p className="mt-3 font-bold">تعذّر تحميل الوظائف</p>
              <p className="text-sm text-sub">تحقّق من اتصالك ثم حاول مجددًا</p>
              <button onClick={() => load(0)} className="btn-secondary mt-4 text-sm">إعادة المحاولة</button>
            </div>
          )}

          {/* results */}
          {!loading && !error &&
            items.map((job) => {
              const posted = timeAgo(job.published_at ?? job.created_at);
              const skills = job.skill_names ?? [];
              return (
              <article key={job.id} className="card-modern group p-5">
                <div className="flex items-start gap-4">
                  {/* category icon tile */}
                  <div className="icon-tile hidden h-12 w-12 shrink-0 text-[20px] transition duration-300 group-hover:bg-primary group-hover:text-white sm:grid">
                    <BriefcaseIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold leading-snug">
                          <Link href={`/jobs/${job.slug}`} className="transition hover:text-primary-dark">
                            {job.title}
                          </Link>
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-sub">
                          {job.employer_name && <span className="font-medium text-ink/75">{job.employer_name}</span>}
                          {job.employer_name && posted && <span aria-hidden className="text-line-strong">•</span>}
                          {posted && (
                            <span className="inline-flex items-center gap-1">
                              <ClockIcon className="text-[13px]" /> {posted}
                            </span>
                          )}
                        </div>
                      </div>
                      <CardActions
                        reportKind="job"
                        favoriteKind="job"
                        id={job.id}
                        favoriteInitial={favIds.has(job.id)}
                        shareUrl={`/jobs/${job.slug}`}
                        shareTitle={job.title}
                      />
                    </div>
                    {job.description && (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-sub">{job.description}</p>
                    )}
                    {skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {skills.slice(0, 5).map((s) => (
                          <span key={s} className={`tag-soft ${tagTone(s)}`}>{s}</span>
                        ))}
                        {skills.length > 5 && (
                          <span className="tag-soft bg-bg text-sub">+{(skills.length - 5).toLocaleString("en-US")}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* stats strip: proposals · location · category */}
                <ListingStats>
                  <ListingStat icon={<UsersIcon />} label="العروض" value={job.proposals_count.toLocaleString("en-US")} />
                  <ListingStat icon={<MapPinIcon />} label="الموقع"
                    value={`${LOCATION_LABEL[job.location_type] ?? job.location_type}${job.city ? ` · ${job.city}` : ""}`} />
                  <ListingStat icon={<BriefcaseIcon />} label="الفئة" value={job.category_name} />
                </ListingStats>

                {/* footer: budget + apply CTA */}
                <ListingFooter priceLabel="الميزانية" priceValue={formatUSDRange(job.budget_min, job.budget_max)}>
                  <Link href={`/jobs/${job.slug}`} className="btn-soft group/btn gap-1.5 px-4 py-1.5 text-sm">
                    قدّم عرضك
                    <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
                  </Link>
                </ListingFooter>
              </article>
              );
            })}

          {/* load more */}
          {!loading && !error && hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => load(items.length)}
                disabled={loadingMore}
                className="btn-secondary text-sm disabled:opacity-60"
              >
                {loadingMore ? "جارٍ التحميل…" : "عرض المزيد من الوظائف"}
              </button>
            </div>
          )}

          {/* empty state */}
          {!loading && !error && items.length === 0 && (
            <div className="card py-14 text-center text-sub">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-tint text-[26px] text-primary"><SearchIcon /></div>
              <p className="mt-3 font-bold">لا توجد وظائف تطابق بحثك</p>
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
                placeholder="ابحث بعنوان الوظيفة أو المهارة…"
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
          {activeCat ? (
            <SubscribeCategoryButton categoryId={activeCat.id} categoryName={activeCat.name_ar} />
          ) : (
            <div className="flex items-start gap-2.5 rounded-m bg-tint p-4 text-sm text-primary-dark">
              <BellIcon className="mt-0.5 shrink-0 text-[18px] text-primary" />
              <span>
                اختر فئة لتشترك فيها ويصلك بريد فور نشر وظيفة جديدة — أو أدِر اشتراكاتك من{" "}
                <a href="/subscriptions" className="font-bold underline">صفحة الاشتراكات</a>.
              </span>
            </div>
          )}
        </FilterPanel>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { EXPERTISE_LABEL, type Freelancer, type Paginated } from "@/lib/types";
import { tagTone } from "@/lib/tags";
import Avatar from "@/components/Avatar";
import CardActions from "@/components/CardActions";
import { useFavoriteIds } from "@/lib/useFavoriteIds";
import { ListingStat, ListingStats, ListingFooter } from "@/components/ListingCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import CategoryFilter from "@/components/CategoryFilter";
import FilterPanel from "@/components/FilterPanel";
import { AlertIcon, ArrowLeftIcon, BadgeCheckIcon, BriefcaseIcon, ClockIcon, GridIcon, MapPinIcon, SearchIcon, StarIcon } from "@/components/icons";
import { formatUSD } from "@/lib/currency";

const EXPERTISE_OPTIONS = ["entry", "intermediate", "expert"] as const;
const PAGE = 12; // load-more page size (server caps limit at 100)

export type Category = { id: number; slug: string; name_ar: string; icon: string; children: Category[] };

/** Availability pill copy/colour for the card identity meta (mirrors the profile hero). */
const AVAIL: Record<string, { t: string; cls: string }> = {
  available_now: { t: "متاح للعمل", cls: "text-success" },
  available_soon: { t: "متاح قريبًا", cls: "text-warn" },
  unavailable: { t: "غير متاح", cls: "text-sub" },
};

/* Client island for /freelancers. The server component (page.tsx) seeds page 1 + the category tree
   so the directory renders as real SSR HTML; filters/search/load-more take over on the client. */
export default function FreelancersClient({
  initialItems, initialCount, initialHasMore, seeded, categories,
}: {
  initialItems: Freelancer[];
  initialCount: number;
  initialHasMore: boolean;
  seeded: boolean;
  categories: Category[];
}) {
  const [items, setItems] = useState<Freelancer[]>(initialItems);
  const [count, setCount] = useState(initialCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(!seeded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [expertise, setExpertise] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [q, setQ] = useState("");
  const [ordering, setOrdering] = useState("-rating_avg");
  const favIds = useFavoriteIds("freelancer"); // pre-fill hearts for items the user already saved

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
        if (expertise) params.set("expertise_level", expertise);
        if (category) params.set("category", category);
        if (subcategory) params.set("subcategory", subcategory);
        if (q) params.set("search", q);
        const res = await fetch(`${API_URL}/freelancers?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Paginated<Freelancer>;
        const results = Array.isArray(json?.results) ? json.results : [];
        setItems((prev) => (append ? [...prev, ...results] : results));
        setCount(json?.count ?? 0);
        setHasMore(Boolean(json?.next));
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
    [expertise, category, subcategory, q, ordering],
  );

  // Refetch on filter/sort change, skipping the first run when the server already seeded the list.
  const loadMounted = useRef(false);
  useEffect(() => {
    if (!loadMounted.current) {
      loadMounted.current = true;
      if (seeded) return;
    }
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expertise, category, subcategory, ordering]);
  // Live search: debounced auto-apply (consistent with the jobs/services filters).
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
    setExpertise("");
    setCategory("");
    setSubcategory("");
    setQ("");
  }

  const hasFilters = !!(expertise || activeCat || activeSub || q);

  return (
    <main className="min-h-screen bg-bg">
      {/* gradient header band */}
      <section className="bg-hero bg-spotlight relative overflow-hidden text-white">
        <div className="dots pointer-events-none absolute inset-0 opacity-[0.10]" aria-hidden />
        <div className="relative mx-auto flex max-w-screen-2xl flex-wrap items-end justify-between gap-4 px-6 pb-10 pt-10">
          <div>
            <span className="glass animate-fade-up mb-3 inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_2px_rgba(27,138,90,0.45)]" />
              دليل المستقلين
            </span>
            <h1 className="animate-fade-up delay-100 text-3xl font-extrabold drop-shadow-sm md:text-4xl">المستقلون</h1>
            <p className="animate-fade-up delay-200 mt-2 text-tint">
              {loading ? "جارٍ التحميل…" : `${count.toLocaleString("en-US")} مستقل متاح — تصفّح وتواصل مباشرة.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="seg">
              {[
                { v: "-rating_avg", l: "الأعلى تقييمًا" },
                { v: "hourly_rate", l: "الأقل سعرًا" },
                { v: "-hourly_rate", l: "الأعلى سعرًا" },
                { v: "-created_at", l: "الأحدث" },
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
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 pb-14 pt-6 lg:flex-row">
        <div className="flex-1 space-y-4 lg:min-h-screen">
          {/* active filters bar */}
          {hasFilters && (
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
              {expertise && (
                <button onClick={() => setExpertise("")} className="chip-removable" title="إزالة الفلتر">
                  {EXPERTISE_LABEL[expertise]}
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
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card animate-pulse">
                  <div className="flex items-start gap-3.5">
                    <div className="h-16 w-16 shrink-0 rounded-full bg-line" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/3 rounded bg-line" />
                      <div className="h-3 w-1/4 rounded bg-line" />
                      <div className="h-3 w-1/2 rounded bg-line" />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4 rounded-m bg-bg px-4 py-3 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, j) => (
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
            </div>
          )}

          {/* error state */}
          {!loading && error && (
            <div className="card py-14 text-center">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-warn-t text-[26px] text-warn"><AlertIcon /></div>
              <p className="mt-3 font-bold">تعذّر تحميل المستقلين</p>
              <p className="text-sm text-sub">تحقّق من اتصالك ثم حاول مجددًا</p>
              <button onClick={() => load(0)} className="btn-secondary mt-4 text-sm">إعادة المحاولة</button>
            </div>
          )}

          {/* results — wide profile list cards (matches the design) */}
          {!loading && !error && items.length > 0 && (
            <div className="space-y-4">
              {items.map((f) => (
                <FreelancerCard key={f.id} f={f} favorited={favIds.has(f.id)} />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => load(items.length)}
                    disabled={loadingMore}
                    className="btn-secondary text-sm disabled:opacity-60"
                  >
                    {loadingMore ? "جارٍ التحميل…" : "عرض المزيد من المستقلين"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* empty state */}
          {!loading && !error && items.length === 0 && (
            <div className="card py-14 text-center text-sub">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-tint text-[26px] text-primary"><SearchIcon /></div>
              <p className="mt-3 font-bold">لا مستقلين يطابقون بحثك</p>
              <p className="text-sm">جرّب توسيع الفلاتر أو امسحها كلها</p>
              {hasFilters && (
                <button onClick={clearFilters} className="btn-secondary mt-4 text-sm">مسح الفلاتر</button>
              )}
            </div>
          )}
        </div>

        <FilterPanel activeCount={(activeCat ? 1 : 0) + (activeSub ? 1 : 0) + (q ? 1 : 0) + (expertise ? 1 : 0)}>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">تصفية النتائج</h3>
              {hasFilters && (
                <button onClick={clearFilters} className="btn-ghost" aria-label="مسح كل الفلاتر">
                  <span aria-hidden>✕</span> مسح
                </button>
              )}
            </div>
            <div className="relative">
              <input
                className="field pe-9"
                placeholder="ابحث بالاسم أو المهارة…"
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
              label="فئة المهارة"
              allLabel="كل الفئات"
            />
            <div className="space-y-1 text-sm">
              <p className="mb-1 text-xs font-medium text-sub">مستوى الخبرة</p>
              <label className={`filter-row ${expertise === "" ? "filter-row-active" : ""}`}>
                <input type="radio" name="exp" className="accent-primary" checked={expertise === ""} onChange={() => setExpertise("")} />
                كل المستويات
              </label>
              {EXPERTISE_OPTIONS.map((lvl) => (
                <label key={lvl} className={`filter-row ${expertise === lvl ? "filter-row-active" : ""}`}>
                  <input type="radio" name="exp" className="accent-primary" checked={expertise === lvl}
                    onChange={() => setExpertise(lvl)} />
                  {EXPERTISE_LABEL[lvl]}
                </label>
              ))}
            </div>
          </div>
        </FilterPanel>
      </div>
    </main>
  );
}

/** Wide profile-style list card (matches the profile hero): identity (avatar + name + title)
    top-right with share / save / report actions top-left, a short description and skills, a
    horizontal stats strip (rating · portfolio · expertise) and an hourly-rate footer. The whole
    card links to the public profile; «عرض الملف» is the card's CTA. */
function FreelancerCard({ f, favorited }: { f: Freelancer; favorited: boolean }) {
  const profileUrl = `/freelancers/${f.id}`;
  const location = [f.city, f.country].filter(Boolean).join(" - ");
  const avail = f.availability ? AVAIL[f.availability] : undefined;
  const rated = Number(f.rating_count) > 0;
  return (
    <Link
      href={profileUrl}
      className="card group block text-right transition hover:border-primary/40 hover:shadow-soft-lg"
    >
      {/* header: identity (right) + actions (left) */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <div className="relative shrink-0">
            <Avatar name={f.name} src={f.avatar_url} className="h-16 w-16" textClassName="text-xl" />
            {f.availability === "available_now" && (
              <span className="absolute bottom-0.5 start-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-success" title="متاح الآن" />
            )}
          </div>
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5 text-base font-bold leading-tight text-ink">
              <span className="truncate">{f.name}</span>
              {f.is_verified && <BadgeCheckIcon className="shrink-0 text-[16px] text-primary" />}
            </p>
            <p className="mt-1 truncate font-bold text-primary-dark">{f.bio_title || "مستقل على شغل أونلاين"}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
              {location && (
                <span className="inline-flex items-center gap-1"><MapPinIcon className="text-[13px] text-primary" /> {location}</span>
              )}
              {avail && (
                <span className={`inline-flex items-center gap-1 ${avail.cls}`}><ClockIcon className="text-[13px]" /> {avail.t}</span>
              )}
            </div>
          </div>
        </div>
        <CardActions
          reportKind="freelancer"
          favoriteKind="freelancer"
          id={f.id}
          favoriteInitial={favorited}
          shareUrl={profileUrl}
          shareTitle={f.name}
        />
      </div>

      {/* description */}
      {f.overview && (
        <p className="mt-3 text-sm leading-relaxed text-sub line-clamp-2">{f.overview}</p>
      )}

      {/* skills */}
      {f.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {f.skills.slice(0, 5).map((s) => (
            <span key={s} className={`tag-soft ${tagTone(s)}`}>{s}</span>
          ))}
          {f.skills.length > 5 && (
            <span className="tag-soft bg-bg text-sub">+{(f.skills.length - 5).toLocaleString("en-US")}</span>
          )}
        </div>
      )}

      {/* stats strip: rating · portfolio · services · experience (mirrors the profile hero) */}
      <ListingStats cols={4}>
        <ListingStat icon={<StarIcon filled />} label="التقييم العام"
          value={rated
            ? <span dir="ltr">{Number(f.rating_avg).toFixed(1)} <span className="text-xs font-normal text-sub">({f.rating_count.toLocaleString("en-US")})</span></span>
            : "جديد"} />
        <ListingStat icon={<GridIcon />} label="أعمال المعرض" value={Number(f.portfolio_count ?? 0).toLocaleString("en-US")} />
        <ListingStat icon={<BriefcaseIcon />} label="الخدمات" value={Number(f.services_count ?? 0).toLocaleString("en-US")} />
        <ListingStat icon={<ClockIcon />} label="سنوات الخبرة"
          value={f.years_experience != null ? f.years_experience.toLocaleString("en-US") : "—"} />
      </ListingStats>

      {/* footer: hourly rate + view-profile CTA */}
      <ListingFooter priceLabel="سعر الساعة" priceValue={f.hourly_rate ? formatUSD(f.hourly_rate) : "عند الطلب"}>
        <span className="btn-soft group/btn gap-1.5 px-4 py-1.5 text-sm">
          عرض الملف
          <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
        </span>
      </ListingFooter>
    </Link>
  );
}

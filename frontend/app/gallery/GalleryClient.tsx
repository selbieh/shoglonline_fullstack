"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import type { Category, GalleryItem, Paginated, PortfolioMediaType } from "@/lib/types";
import { tagTone } from "@/lib/tags";
import Avatar from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import CategoryFilter from "@/components/CategoryFilter";
import FilterPanel from "@/components/FilterPanel";
import CardActions from "@/components/CardActions";
import { useFavoriteIds } from "@/lib/useFavoriteIds";
import {
  AlertIcon,
  ArrowLeftIcon,
  BadgeCheckIcon,
  BarChartIcon,
  ExternalLinkIcon,
  GridIcon,
  ImageIcon,
  PlayIcon,
  SearchIcon,
  StarIcon,
} from "@/components/icons";

export const PAGE = 24;
export const DEFAULT_SORT = "-created_at";

export type GalleryFilters = {
  media: string;
  category: string;
  skill: string;
  q: string;
  ordering: string;
};

const MEDIA_FILTERS = [
  { v: "", l: "كل الأنواع" },
  { v: "image", l: "صور" },
  { v: "video", l: "فيديو" },
  { v: "link", l: "روابط" },
] as const;

const SORTS = [
  { v: "-created_at", l: "الأحدث" },
  { v: "-views_count", l: "الأكثر مشاهدة" },
  { v: "-profile__rating_avg", l: "الأعلى تقييمًا" },
  { v: "created_at", l: "الأقدم" },
] as const;

const MEDIA_LABEL: Record<PortfolioMediaType, string> = { image: "صورة", video: "فيديو", link: "رابط" };

/* Client island for /gallery. The server component (page.tsx) reads the URL filters, fetches the
   matching first page + the category tree, and seeds this — so a shared/crawled link renders as real
   SSR HTML. Filters still mirror into the querystring on the client so the view stays shareable. */
export default function GalleryClient({
  initialItems, initialCount, initialHasMore, seeded, categories, initialFilters,
}: {
  initialItems: GalleryItem[];
  initialCount: number;
  initialHasMore: boolean;
  seeded: boolean;
  categories: Category[];
  initialFilters: GalleryFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = useState<GalleryItem[]>(initialItems);
  const [count, setCount] = useState(initialCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(!seeded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  // Filter state — seeded from the server (which read it from the URL).
  const [media, setMedia] = useState(initialFilters.media);
  const [category, setCategory] = useState(initialFilters.category);
  const [skill, setSkill] = useState(initialFilters.skill);
  const [q, setQ] = useState(initialFilters.q);
  const [ordering, setOrdering] = useState(initialFilters.ordering);
  const favIds = useFavoriteIds("portfolio"); // pre-fill hearts for items the user already saved

  // Mirror the active filters into the querystring (defaults omitted to keep links clean).
  const syncUrl = useCallback(() => {
    const sp = new URLSearchParams();
    if (ordering && ordering !== DEFAULT_SORT) sp.set("ordering", ordering);
    if (media) sp.set("media_type", media);
    if (category) sp.set("category", category);
    if (skill) sp.set("skill", skill);
    if (q) sp.set("search", q);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [ordering, media, category, skill, q, pathname, router]);

  const load = useCallback(
    async (offset: number) => {
      const append = offset > 0;
      append ? setLoadingMore(true) : setLoading(true);
      setError(false);
      try {
        const sp = new URLSearchParams({ ordering, limit: String(PAGE), offset: String(offset) });
        if (media) sp.set("media_type", media);
        if (category) sp.set("category", category);
        if (skill) sp.set("skill", skill);
        if (q) sp.set("search", q);
        const res = await fetch(`${API_URL}/freelancers/portfolio?${sp}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Paginated<GalleryItem>;
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
    [media, category, skill, q, ordering],
  );

  // Reload from the top + sync the URL whenever a non-search filter changes. Skip the first run
  // when the server already seeded the matching list (avoids a redundant fetch on load).
  const loadMounted = useRef(false);
  useEffect(() => {
    if (!loadMounted.current) {
      loadMounted.current = true;
      if (seeded) return;
    }
    syncUrl();
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, category, skill, ordering]);

  // Live search: debounced auto-apply (consistent with the jobs/freelancers filters).
  const qMounted = useRef(false);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!qMounted.current) {
      qMounted.current = true;
      return;
    }
    qTimer.current = setTimeout(() => {
      syncUrl();
      load(0);
    }, 350);
    return () => { if (qTimer.current) clearTimeout(qTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Explicit search (Enter / button): cancel the pending debounce so we don't fire twice.
  function runSearch() {
    if (qTimer.current) clearTimeout(qTimer.current);
    syncUrl();
    load(0);
  }

  // Skill cloud — the most common skills across the loaded works, as quick toggle-filters.
  const skillCloud = useMemo(() => {
    const freq = new Map<string, number>();
    for (const it of items) for (const s of it.skills ?? []) freq.set(s, (freq.get(s) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s]) => s);
    // keep an actively-selected skill visible even if it isn't in the current page's cloud
    return skill && !top.includes(skill) ? [skill, ...top].slice(0, 12) : top;
  }, [items, skill]);

  const activeCat = categories.find((c) => String(c.id) === category) ?? null;
  const anyFilter = Boolean(media || category || skill || q);
  function clearAll() {
    setMedia("");
    setCategory("");
    setSkill("");
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
              <GridIcon className="text-[14px]" /> معرض الأعمال
            </span>
            <h1 className="animate-fade-up delay-100 text-3xl font-extrabold drop-shadow-sm md:text-4xl">معرض الأعمال</h1>
            <p className="animate-fade-up delay-200 mt-2 text-tint">
              {loading ? "جارٍ التحميل…" : `${count.toLocaleString("en-US")} عمل من المستقلين — تصفّح واطّلع على التفاصيل.`}
            </p>
          </div>
          <div className="seg flex-wrap">
            {SORTS.map((o) => (
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
      </section>

      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 pb-14 pt-6 lg:flex-row">
        <div className="flex-1 space-y-4">
          {/* active filters bar */}
          {anyFilter && (
            <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="text-sm font-bold text-ink">الفلاتر النشطة</span>
              {category && (
                <button onClick={() => setCategory("")} className="chip-removable" title="إزالة التصنيف">
                  {activeCat && <CategoryIcon slug={activeCat.slug} className="text-[13px]" />}
                  {activeCat?.name_ar ?? "التصنيف"}
                  <span className="chip-x" aria-hidden>✕</span>
                </button>
              )}
              {media && (
                <button onClick={() => setMedia("")} className="chip-removable" title="إزالة النوع">
                  {MEDIA_FILTERS.find((m) => m.v === media)?.l}
                  <span className="chip-x" aria-hidden>✕</span>
                </button>
              )}
              {skill && (
                <button onClick={() => setSkill("")} className="chip-removable" title="إزالة المهارة">
                  {skill}
                  <span className="chip-x" aria-hidden>✕</span>
                </button>
              )}
              {q && (
                <button onClick={() => setQ("")} className="chip-removable" title="إزالة البحث">
                  <SearchIcon className="text-[13px]" /> {q}
                  <span className="chip-x" aria-hidden>✕</span>
                </button>
              )}
              <button onClick={clearAll} className="btn-ghost ms-auto" aria-label="مسح كل الفلاتر">
                <span aria-hidden>✕</span> مسح الكل
              </button>
            </div>
          )}

          {/* loading skeletons */}
          {loading && (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card-modern animate-pulse overflow-hidden">
                  <div className="aspect-video bg-line" />
                  <div className="p-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-line" />
                      <div className="h-3 w-1/3 rounded bg-line" />
                    </div>
                    <div className="mt-3 h-4 w-3/4 rounded bg-line" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-line" />
                    <div className="mt-3 flex gap-1.5">
                      <div className="h-5 w-16 rounded-full bg-line" />
                      <div className="h-5 w-20 rounded-full bg-line" />
                    </div>
                    <div className="mt-3 flex gap-4 border-t border-line pt-3">
                      <div className="h-3 w-10 rounded bg-line" />
                      <div className="h-3 w-14 rounded bg-line" />
                    </div>
                    <div className="mt-3 h-9 w-full rounded-m bg-line" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* error state */}
          {!loading && error && items.length === 0 && (
            <div className="card py-14 text-center">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-warn-t text-[26px] text-warn"><AlertIcon /></div>
              <p className="mt-3 font-bold">تعذّر تحميل الأعمال</p>
              <p className="text-sm text-sub">تحقّق من اتصالك ثم حاول مجددًا</p>
              <button onClick={() => load(0)} className="btn-secondary mt-4 text-sm">إعادة المحاولة</button>
            </div>
          )}

          {/* results grid */}
          {!loading && !error && items.length > 0 && (
            <>
              {/* flex-wrap + justify-center (not grid) so a partial last row centers
                  under the row above instead of being stranded on the start side */}
              <div className="flex flex-wrap justify-center gap-5">
                {items.map((it) => (
                  <GalleryCard key={it.id} it={it} favorited={favIds.has(it.id)} />
                ))}
              </div>
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => load(items.length)}
                    disabled={loadingMore}
                    className="btn-secondary text-sm disabled:opacity-60"
                  >
                    {loadingMore ? "جارٍ التحميل…" : "عرض المزيد من الأعمال"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* empty state */}
          {!loading && !error && items.length === 0 && (
            <div className="card py-14 text-center text-sub">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-tint text-[26px] text-primary"><GridIcon /></div>
              <p className="mt-3 font-bold">لا أعمال تطابق بحثك</p>
              <p className="text-sm">جرّب توسيع الفلاتر أو امسحها كلها</p>
              {anyFilter && (
                <button onClick={clearAll} className="btn-secondary mt-4 text-sm">مسح الفلاتر</button>
              )}
            </div>
          )}
        </div>

        <FilterPanel activeCount={(media ? 1 : 0) + (category ? 1 : 0) + (skill ? 1 : 0) + (q ? 1 : 0)}>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">تصفية النتائج</h3>
              {anyFilter && (
                <button onClick={clearAll} className="btn-ghost" aria-label="مسح كل الفلاتر">
                  <span aria-hidden>✕</span> مسح
                </button>
              )}
            </div>

            <div className="relative">
              <input
                className="field pe-9"
                placeholder="ابحث في الأعمال أو المستقلين…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <button
                type="button"
                onClick={runSearch}
                aria-label="بحث"
                className="absolute inset-y-0 end-2 my-auto grid h-7 w-7 place-content-center text-[18px] text-sub transition hover:text-primary"
              >
                <SearchIcon />
              </button>
            </div>

            {/* media type */}
            <div className="space-y-1 text-sm">
              <p className="mb-1 text-xs font-medium text-sub">نوع العمل</p>
              {MEDIA_FILTERS.map((m) => (
                <label key={m.v || "all"} className={`filter-row ${media === m.v ? "filter-row-active" : ""}`}>
                  <input type="radio" name="media" className="accent-primary" checked={media === m.v} onChange={() => setMedia(m.v)} />
                  {m.l}
                </label>
              ))}
            </div>

            {/* category facet */}
            {categories.length > 0 && (
              <CategoryFilter
                categories={categories}
                selectedId={category}
                onSelect={(sel) => setCategory(sel ? sel.id : "")}
                label="التصنيف"
                allLabel="كل التصنيفات"
                searchPlaceholder="ابحث عن تصنيف…"
              />
            )}

            {/* skill quick-filters (from the loaded works) */}
            {skillCloud.length > 0 && (
              <div className="space-y-2 text-sm">
                <p className="text-xs font-medium text-sub">مهارات شائعة</p>
                <div className="flex flex-wrap gap-1.5">
                  {skillCloud.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSkill(skill === s ? "" : s)}
                      className={`tag-soft transition ${skill === s ? "ring-1 ring-primary" : ""} ${tagTone(s)}`}
                      title={`تصفية حسب ${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </FilterPanel>
      </div>
    </main>
  );
}

function MediaBadge({ t }: { t: PortfolioMediaType }) {
  const Icon = t === "video" ? PlayIcon : t === "link" ? ExternalLinkIcon : ImageIcon;
  return (
    <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
      <Icon className="text-[12px]" /> {MEDIA_LABEL[t]}
    </span>
  );
}

// Branded SVG covers per work type (public/) — image is the default/fallback.
const PLACEHOLDER: Record<PortfolioMediaType, string> = {
  image: "/gallery-placeholder.svg",
  video: "/gallery-placeholder-video.svg",
  link: "/gallery-placeholder-link.svg",
};

/** Work thumbnail with full control: the real image fills the fixed 16:9 frame via object-cover
    (cropped to fit — it can never stretch, overflow, or break the card), and a missing OR broken
    image degrades to the branded SVG cover for its media type (picture / play / link glyph) instead
    of the browser's broken-image icon. The work title is intentionally NOT drawn on the cover — it
    already shows on the card. */
function GalleryThumb({ it }: { it: GalleryItem }) {
  const [broken, setBroken] = useState(false);
  const useThumb = !!it.thumb && !broken;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={useThumb ? it.thumb : (PLACEHOLDER[it.media_type] ?? PLACEHOLDER.image)}
      alt={useThumb ? it.title : ""}
      loading="lazy"
      onError={useThumb ? () => setBroken(true) : undefined}
      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
    />
  );
}

/** A gallery tile (in the shared profile-card language): thumbnail + the owning freelancer's
    identity, a stats strip (rating · views · category) and a «عرض العمل» CTA, linking to the
    single-work showcase. */
function GalleryCard({ it, favorited }: { it: GalleryItem; favorited: boolean }) {
  const href = `/freelancers/${it.worker_id}/portfolio/${it.id}`;
  const rated = Number(it.worker_rating_count) > 0;
  const views = Number(it.views_count ?? 0);
  return (
    <Link
      href={href}
      // widths mirror the old grid (1 / 2 / 3 cols, gap-5=1.25rem) so full rows are unchanged;
      // as flex items they let justify-center balance the final partial row
      className="card-modern group flex w-full flex-col overflow-hidden sm:w-[calc(50%-0.63rem)] xl:w-[calc(33.333%-0.84rem)]"
    >
      <div className="relative aspect-video overflow-hidden bg-tint">
        <GalleryThumb it={it} />
        <MediaBadge t={it.media_type} />
        {/* report · save · share — overlaid on the cover, clear of the media/category badges */}
        <CardActions
          variant="overlay"
          reportKind="portfolio"
          favoriteKind="portfolio"
          id={it.id}
          favoriteInitial={favorited}
          shareUrl={href}
          shareTitle={it.title}
          className="absolute bottom-2 end-2 z-10"
        />
        {/* category lives on the cover where it has the full width to show in full,
            instead of being crammed (and truncated) into the body text */}
        {it.category?.name && (
          <span className="absolute start-2 top-2 inline-flex max-w-[75%] items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-primary-dark shadow-sm backdrop-blur">
            <GridIcon className="shrink-0 text-[12px]" />
            <span className="truncate">{it.category.name}</span>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        {/* owner identity */}
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={it.worker_name} src={it.worker_avatar} className="h-7 w-7" textClassName="text-[11px]" />
          <span className="truncate text-xs font-medium text-sub">{it.worker_name}</span>
          {it.worker_verified && <BadgeCheckIcon className="shrink-0 text-[14px] text-success" />}
        </div>

        {/* title — up to two lines so longer titles read in full (height reserved so cards align) */}
        <h3 className="mt-2 line-clamp-2 min-h-[2.6rem] font-bold leading-snug text-ink transition group-hover:text-primary-dark">{it.title}</h3>
        {it.project_type && <p className="mt-0.5 line-clamp-1 text-xs text-sub">{it.project_type}</p>}

        {/* skills */}
        {it.skills && it.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {it.skills.slice(0, 3).map((s) => (
              <span key={s} className={`tag-soft ${tagTone(s)}`}>{s}</span>
            ))}
          </div>
        )}

        {/* compact meta + CTA, pinned to the bottom so cards align in the grid.
            Short, label-free values (rating · views) — nothing here can truncate. */}
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-4 border-t border-line pt-3 text-xs text-sub">
            <span className="inline-flex items-center gap-1" title="التقييم">
              <StarIcon filled className="text-[14px] text-amber-500" />
              {rated
                ? <span dir="ltr" className="font-bold text-ink">{Number(it.worker_rating).toFixed(1)}</span>
                : <span className="font-medium">جديد</span>}
            </span>
            <span className="inline-flex items-center gap-1" title="المشاهدات">
              <BarChartIcon className="text-[14px] text-primary" />
              <span className="font-bold text-ink">{views.toLocaleString("en-US")}</span>
              مشاهدة
            </span>
          </div>
          <span className="btn-soft group/btn mt-3 w-full justify-center gap-1.5 py-2 text-sm">
            عرض العمل
            <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

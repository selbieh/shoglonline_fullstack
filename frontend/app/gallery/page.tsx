"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import type { Category, GalleryItem, Paginated, PortfolioMediaType } from "@/lib/types";
import { tagTone } from "@/lib/tags";
import Avatar from "@/components/Avatar";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ListingStat, ListingStats } from "@/components/ListingCard";
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

const PAGE = 24;
const DEFAULT_SORT = "-created_at";

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

/** Public works gallery (معرض الأعمال) — every freelancer's portfolio item in one filterable grid;
    each tile opens the single-work showcase (slide-22). Filters live in the URL so a filtered view
    is shareable and the back button works. Works for visitors too. */
function GalleryInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [count, setCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filter state — seeded from the URL so a shared/bookmarked link restores the view.
  const [media, setMedia] = useState(params.get("media_type") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [skill, setSkill] = useState(params.get("skill") ?? "");
  const [q, setQ] = useState(params.get("search") ?? "");
  const [ordering, setOrdering] = useState(params.get("ordering") ?? DEFAULT_SORT);

  useEffect(() => {
    fetch(`${API_URL}/categories`)
      .then((r) => r.json())
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

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

  // Reload from the top + sync the URL whenever a non-search filter changes.
  useEffect(() => {
    syncUrl();
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, category, skill, ordering]);

  // Live search: debounced auto-apply (consistent with the jobs/freelancers filters).
  const qMounted = useRef(false);
  useEffect(() => {
    if (!qMounted.current) {
      qMounted.current = true;
      return;
    }
    const t = setTimeout(() => {
      syncUrl();
      load(0);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

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
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 pb-10 pt-10">
          <div>
            <span className="glass animate-fade-up mb-3 inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-white">
              <GridIcon className="text-[14px]" /> معرض الأعمال
            </span>
            <h1 className="animate-fade-up delay-100 text-3xl font-extrabold drop-shadow-sm md:text-4xl">معرض الأعمال</h1>
            <p className="animate-fade-up delay-200 mt-2 text-tint">
              {loading ? "جارٍ التحميل…" : `${count.toLocaleString("ar-EG")} عمل من المستقلين — تصفّح واطّلع على التفاصيل.`}
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

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-14 pt-6 lg:flex-row">
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
                    <div className="mt-3 grid grid-cols-3 gap-4 rounded-m bg-bg px-4 py-3">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <div key={j} className="space-y-1.5">
                          <div className="h-3 w-12 rounded bg-line" />
                          <div className="h-4 w-10 rounded bg-line" />
                        </div>
                      ))}
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
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((it) => (
                  <GalleryCard key={it.id} it={it} />
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

        <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-6 lg:w-80 lg:self-start">
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
              <div className="space-y-1 text-sm">
                <p className="mb-1 text-xs font-medium text-sub">التصنيف</p>
                <div className="max-h-72 space-y-1 overflow-y-auto pe-1">
                  <label className={`filter-row ${category === "" ? "filter-row-active" : ""}`}>
                    <input type="radio" name="cat" className="accent-primary" checked={category === ""} onChange={() => setCategory("")} />
                    كل التصنيفات
                  </label>
                  {categories.map((c) => (
                    <label key={c.id} className={`filter-row ${category === String(c.id) ? "filter-row-active" : ""}`}>
                      <input
                        type="radio"
                        name="cat"
                        className="accent-primary"
                        checked={category === String(c.id)}
                        onChange={() => setCategory(String(c.id))}
                      />
                      <CategoryIcon slug={c.slug} className="text-[18px] text-primary" /> {c.name_ar}
                    </label>
                  ))}
                </div>
              </div>
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
        </aside>
      </div>
    </main>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-bg" />}>
      <GalleryInner />
    </Suspense>
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
function GalleryCard({ it }: { it: GalleryItem }) {
  const href = `/freelancers/${it.worker_id}/portfolio/${it.id}`;
  const rated = Number(it.worker_rating_count) > 0;
  return (
    <Link href={href} className="card-modern group flex flex-col overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-tint">
        <GalleryThumb it={it} />
        <MediaBadge t={it.media_type} />
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        {/* owner identity */}
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={it.worker_name} src={it.worker_avatar} className="h-7 w-7" textClassName="text-[11px]" />
          <span className="truncate text-xs font-medium text-sub">{it.worker_name}</span>
          {it.worker_verified && <BadgeCheckIcon className="shrink-0 text-[14px] text-success" />}
        </div>

        {/* title */}
        <h3 className="mt-2 line-clamp-1 font-bold text-ink transition group-hover:text-primary-dark">{it.title}</h3>
        {it.project_type && <p className="mt-0.5 line-clamp-1 text-xs text-sub">{it.project_type}</p>}

        {/* skills */}
        {it.skills && it.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {it.skills.slice(0, 3).map((s) => (
              <span key={s} className={`tag-soft ${tagTone(s)}`}>{s}</span>
            ))}
          </div>
        )}

        {/* stats strip + CTA, pinned to the bottom so cards align in the grid */}
        <div className="mt-auto pt-3">
          <ListingStats>
            <ListingStat icon={<StarIcon filled />} label="التقييم"
              value={rated ? <span dir="ltr">{Number(it.worker_rating).toFixed(1)}</span> : "جديد"} />
            <ListingStat icon={<BarChartIcon />} label="المشاهدات" value={Number(it.views_count ?? 0).toLocaleString("ar-EG")} />
            <ListingStat icon={<GridIcon />} label="الفئة" value={it.category?.name || "—"} />
          </ListingStats>
          <span className="btn-primary group/btn mt-3 w-full justify-center gap-1.5 py-2 text-sm">
            عرض العمل
            <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

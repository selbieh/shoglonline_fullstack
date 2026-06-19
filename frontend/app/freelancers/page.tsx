"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { EXPERTISE_LABEL, type Freelancer, type Paginated } from "@/lib/types";
import { tagTone } from "@/lib/tags";
import Avatar from "@/components/Avatar";
import FavoriteButton from "@/components/FavoriteButton";
import { ListingStat, ListingStats, ListingFooter } from "@/components/ListingCard";
import { AlertIcon, ArrowLeftIcon, BadgeCheckIcon, BriefcaseIcon, ClockIcon, GridIcon, MapPinIcon, SearchIcon, ShareIcon, StarIcon } from "@/components/icons";

const EXPERTISE_OPTIONS = ["entry", "intermediate", "expert"] as const;

/** Availability pill copy/colour for the card identity meta (mirrors the profile hero). */
const AVAIL: Record<string, { t: string; cls: string }> = {
  available_now: { t: "متاح للعمل", cls: "text-success" },
  available_soon: { t: "متاح قريبًا", cls: "text-warn" },
  unavailable: { t: "غير متاح", cls: "text-sub" },
};

/** Public freelancer directory (FR-PROF). Works for visitors too. */
export default function FreelancersPage() {
  const [data, setData] = useState<Paginated<Freelancer> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expertise, setExpertise] = useState("");
  const [q, setQ] = useState("");
  const [ordering, setOrdering] = useState("-rating_avg");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ ordering });
      if (expertise) params.set("expertise_level", expertise);
      if (q) params.set("search", q);
      const res = await fetch(`${API_URL}/freelancers?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Paginated<Freelancer>;
      setData({ ...json, results: Array.isArray(json?.results) ? json.results : [] });
    } catch {
      setError(true);
      setData({ count: 0, next: null, previous: null, results: [] });
    } finally {
      setLoading(false);
    }
  }, [expertise, q, ordering]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expertise, ordering]);
  // Live search: debounced auto-apply (consistent with the jobs/services filters).
  const qMounted = useRef(false);
  useEffect(() => {
    if (!qMounted.current) {
      qMounted.current = true;
      return;
    }
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function clearFilters() {
    setExpertise("");
    setQ("");
  }

  const count = data?.count ?? 0;

  return (
    <main className="min-h-screen bg-bg">
      {/* gradient header band */}
      <section className="bg-hero bg-spotlight relative overflow-hidden text-white">
        <div className="dots pointer-events-none absolute inset-0 opacity-[0.10]" aria-hidden />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 pb-10 pt-10">
          <div>
            <span className="glass animate-fade-up mb-3 inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_2px_rgba(27,138,90,0.45)]" />
              دليل المستقلين
            </span>
            <h1 className="animate-fade-up delay-100 text-3xl font-extrabold drop-shadow-sm md:text-4xl">المستقلون</h1>
            <p className="animate-fade-up delay-200 mt-2 text-tint">
              {loading ? "جارٍ التحميل…" : `${count.toLocaleString("ar-EG")} مستقل متاح — تصفّح وتواصل مباشرة.`}
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

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-14 pt-6 lg:flex-row">
        <div className="flex-1 space-y-4">
          {/* active filters bar */}
          {(expertise || q) && (
            <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="text-sm font-bold text-ink">الفلاتر النشطة</span>
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
              <button onClick={load} className="btn-secondary mt-4 text-sm">إعادة المحاولة</button>
            </div>
          )}

          {/* results — wide profile list cards (matches the design) */}
          {!loading && !error && count > 0 && (
            <div className="space-y-4">
              {data!.results.map((f) => (
                <FreelancerCard key={f.id} f={f} />
              ))}
            </div>
          )}

          {/* empty state */}
          {!loading && !error && count === 0 && (
            <div className="card py-14 text-center text-sub">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-tint text-[26px] text-primary"><SearchIcon /></div>
              <p className="mt-3 font-bold">لا مستقلين يطابقون بحثك</p>
              <p className="text-sm">جرّب توسيع الفلاتر أو امسحها كلها</p>
              {(expertise || q) && (
                <button onClick={clearFilters} className="btn-secondary mt-4 text-sm">مسح الفلاتر</button>
              )}
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-6 lg:w-80 lg:self-start">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">تصفية النتائج</h3>
              {(expertise || q) && (
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
                onKeyDown={(e) => e.key === "Enter" && load()}
              />
              <button
                type="button"
                onClick={load}
                aria-label="بحث"
                className="absolute inset-y-0 end-2 my-auto grid h-7 w-7 place-content-center text-[18px] text-sub transition hover:text-primary"
              >
                <SearchIcon />
              </button>
            </div>
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
        </aside>
      </div>
    </main>
  );
}

/** Wide profile-style list card (matches the profile hero): identity (avatar + name + title)
    top-right with share / save / report actions top-left, a short description and skills, a
    horizontal stats strip (rating · portfolio · expertise) and an hourly-rate footer. The whole
    card links to the public profile; «عرض الملف» is the card's CTA. */
function FreelancerCard({ f }: { f: Freelancer }) {
  const profileUrl = `/freelancers/${f.id}`;
  const location = [f.city, f.country].filter(Boolean).join(" - ");
  const avail = f.availability ? AVAIL[f.availability] : undefined;
  const rated = Number(f.rating_count) > 0;
  const onShare = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = typeof window !== "undefined" ? `${window.location.origin}${profileUrl}` : profileUrl;
    if (typeof navigator !== "undefined" && navigator.share) navigator.share({ url }).catch(() => {});
    else navigator?.clipboard?.writeText(url).catch(() => {});
  };
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <Link
      href={profileUrl}
      className="card group block text-right transition hover:border-primary/40 hover:shadow-soft-lg"
    >
      {/* header: identity (right) + actions (left) */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0">
            <Avatar name={f.name} src={f.avatar_url} className="h-16 w-16" textClassName="text-xl" />
            {f.availability === "available_now" && (
              <span className="absolute bottom-0.5 left-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-success" title="متاح الآن" />
            )}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-base font-bold leading-tight text-ink">
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
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onShare} title="مشاركة" aria-label="مشاركة"
            className="grid h-9 w-9 place-content-center rounded-full text-[18px] text-sub transition hover:bg-tint hover:text-primary">
            <ShareIcon />
          </button>
          <FavoriteButton kind="freelancer" id={f.id}
            className="grid h-9 w-9 place-content-center rounded-full text-[18px] text-sub transition hover:bg-tint hover:text-danger" />
          <button type="button" onClick={stop} title="إبلاغ" aria-label="إبلاغ"
            className="grid h-9 w-9 place-content-center rounded-full border border-transparent text-[18px] text-sub transition hover:border-danger/30 hover:bg-danger-t hover:text-danger">
            <AlertIcon />
          </button>
        </div>
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
            <span className="tag-soft bg-bg text-sub">+{(f.skills.length - 5).toLocaleString("ar-EG")}</span>
          )}
        </div>
      )}

      {/* stats strip: rating · portfolio · services · experience (mirrors the profile hero) */}
      <ListingStats cols={4}>
        <ListingStat icon={<StarIcon filled />} label="التقييم العام"
          value={rated
            ? <span dir="ltr">{Number(f.rating_avg).toFixed(1)} <span className="text-xs font-normal text-sub">({f.rating_count.toLocaleString("ar-EG")})</span></span>
            : "جديد"} />
        <ListingStat icon={<GridIcon />} label="أعمال المعرض" value={Number(f.portfolio_count ?? 0).toLocaleString("ar-EG")} />
        <ListingStat icon={<BriefcaseIcon />} label="الخدمات" value={Number(f.services_count ?? 0).toLocaleString("ar-EG")} />
        <ListingStat icon={<ClockIcon />} label="سنوات الخبرة"
          value={f.years_experience != null ? f.years_experience.toLocaleString("ar-EG") : "—"} />
      </ListingStats>

      {/* footer: hourly rate + view-profile CTA */}
      <ListingFooter priceLabel="سعر الساعة" priceValue={f.hourly_rate ? `$${f.hourly_rate}` : "عند الطلب"}>
        <span className="btn-primary group/btn gap-1.5 px-4 py-1.5 text-sm">
          عرض الملف
          <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
        </span>
      </ListingFooter>
    </Link>
  );
}

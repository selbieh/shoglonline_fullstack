"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { EXPERTISE_LABEL, type Freelancer, type Paginated } from "@/lib/types";
import { tagTone } from "@/lib/tags";
import { AlertIcon, ArrowLeftIcon, BadgeCheckIcon, SearchIcon, SparklesIcon, StarIcon } from "@/components/icons";

const EXPERTISE_OPTIONS = ["entry", "intermediate", "expert"] as const;

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
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_2px_rgba(110,231,183,0.7)]" />
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
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card-modern animate-pulse p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 shrink-0 rounded-full bg-line sm:h-20 sm:w-20" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-1/2 rounded bg-line" />
                      <div className="h-3 w-1/3 rounded bg-line" />
                      <div className="h-5 w-20 rounded-full bg-line" />
                      <div className="mt-1 flex gap-1.5">
                        <div className="h-6 w-16 rounded-full bg-line" />
                        <div className="h-6 w-12 rounded-full bg-line" />
                        <div className="h-6 w-14 rounded-full bg-line" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3.5">
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

          {/* results */}
          {!loading && !error && count > 0 && (
            <div className="space-y-4">
              {data!.results.map((f) => (
                <Link
                  key={f.id}
                  href={`/freelancers/${f.id}`}
                  className="card-modern group block p-5"
                >
                  <div className="flex items-start gap-4">
                    {/* avatar with gradient ring + verified badge */}
                    <div className="relative shrink-0">
                      <div className="rounded-full bg-gradient-to-br from-primary to-primary-deep p-0.5 shadow-soft">
                        {f.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={f.avatar_url}
                            alt={f.name}
                            className="h-16 w-16 rounded-full object-cover ring-2 ring-white sm:h-20 sm:w-20"
                          />
                        ) : (
                          <span className="bg-hero grid h-16 w-16 place-content-center rounded-full text-2xl font-extrabold text-white ring-2 ring-white sm:h-20 sm:w-20">
                            {f.name.charAt(0)}
                          </span>
                        )}
                        {f.is_verified && (
                          <span
                            className="absolute -bottom-1 -start-1 grid h-6 w-6 place-content-center rounded-full bg-white text-[18px] text-success ring-2 ring-white"
                            title="موثّق"
                          >
                            <BadgeCheckIcon />
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-lg font-bold group-hover:text-primary-dark">
                        <span className="truncate">{f.name}</span>
                        {f.is_verified && <BadgeCheckIcon className="shrink-0 text-[16px] text-success" />}
                      </p>
                      <p className="truncate text-sm text-sub">{f.bio_title || "مستقل على شغل أونلاين"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {Number(f.rating_count) > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warn-t px-2 py-0.5 text-xs font-bold text-warn">
                            <StarIcon filled className="text-[12px]" /> {Number(f.rating_avg).toFixed(1)}
                            <span className="font-normal text-sub">({f.rating_count.toLocaleString("ar-EG")})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            <SparklesIcon className="text-[12px]" /> جديد
                          </span>
                        )}
                        {f.expertise_level && (
                          <span className="tag-soft bg-tint text-primary-dark">{EXPERTISE_LABEL[f.expertise_level]}</span>
                        )}
                      </div>

                      {f.skills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {f.skills.slice(0, 6).map((s) => (
                            <span key={s} className={`tag-soft ${tagTone(s)}`}>{s}</span>
                          ))}
                          {f.skills.length > 6 && (
                            <span className="tag-soft bg-bg text-sub">+{(f.skills.length - 6).toLocaleString("ar-EG")}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3.5">
                    {f.hourly_rate ? (
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="text-[11px] text-sub">السعر/الساعة</span>
                        <span className="text-xl font-extrabold text-primary"><span dir="ltr">{f.hourly_rate}</span></span>
                        <span className="text-xs font-medium text-sub">د.ك</span>
                      </span>
                    ) : (
                      <span className="text-sm text-sub">السعر عند الطلب</span>
                    )}
                    <span className="btn-primary group/btn gap-1.5 px-4 py-1.5 text-sm">
                      عرض الملف
                      <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
                    </span>
                  </div>
                </Link>
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

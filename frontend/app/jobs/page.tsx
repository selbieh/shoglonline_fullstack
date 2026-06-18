"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, API_URL } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { tagTone } from "@/lib/tags";
import { LOCATION_LABEL, type Category, type Job, type Paginated } from "@/lib/types";
import {
  AlertIcon, ArrowLeftIcon, BellIcon, BookmarkIcon, BriefcaseIcon, ClockIcon, MapPinIcon,
  SearchIcon, UsersIcon, WalletIcon,
} from "@/components/icons";
import { CategoryIcon } from "@/components/CategoryIcon";
import SubscribeCategoryButton from "@/components/SubscribeCategoryButton";

/** Jobs listing with filters (FR-JOB-3). Public — works for visitors too. */
function JobsInner() {
  const params = useSearchParams();
  const [jobs, setJobs] = useState<Paginated<Job> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<string>(params.get("category") ?? ""); // preselect from URL
  const [subcategory, setSubcategory] = useState<string>(params.get("subcategory") ?? "");
  const [q, setQ] = useState("");
  const [ordering, setOrdering] = useState("-published_at");
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  const subcats = categories.find((c) => String(c.id) === category)?.children ?? [];
  const activeCat = categories.find((c) => String(c.id) === category);
  const activeSub = subcats.find((c) => String(c.id) === subcategory);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ ordering });
      if (category) sp.set("category", category);
      if (subcategory) sp.set("subcategory", subcategory);
      if (q) sp.set("search", q);
      const res = await fetch(`${API_URL}/jobs?${sp}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Paginated<Job>;
      setJobs({ ...data, results: Array.isArray(data?.results) ? data.results : [] });
    } catch {
      setError(true);
      setJobs({ count: 0, next: null, previous: null, results: [] });
    } finally {
      setLoading(false);
    }
  }, [category, subcategory, q, ordering]);

  function pickCategory(id: string) {
    setCategory(id);
    setSubcategory(""); // reset sub-category when the parent changes
  }

  function clearFilters() {
    setCategory("");
    setSubcategory("");
    setQ("");
  }

  useEffect(() => {
    fetch(`${API_URL}/categories`)
      .then(async (r) => (r.ok ? setCategories(await r.json()) : undefined))
      .catch(() => undefined);
  }, []);
  // Resolve the URL ?category= (id OR slug) once categories load. A top-level value
  // selects the parent radio; a child value reflects as parent radio + subcategory.
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
  useEffect(() => {
    load();
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
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function toggleWatch(job: Job) {
    setSaved((m) => ({ ...m, [job.id]: !m[job.id] })); // optimistic
    try {
      await api(`/me/watchlist/${job.id}`, { method: "PUT" });
    } catch {
      setSaved((m) => ({ ...m, [job.id]: !m[job.id] })); // revert on failure
    }
  }

  const count = jobs?.count ?? 0;

  return (
    <main className="min-h-screen bg-bg">
      {/* gradient header band */}
      <section className="bg-hero bg-spotlight relative overflow-hidden text-white">
        <div className="dots pointer-events-none absolute inset-0 opacity-[0.10]" aria-hidden />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 pb-10 pt-10">
          <div>
            <span className="glass animate-fade-up mb-3 inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_2px_rgba(110,231,183,0.7)]" />
              لوحة الوظائف
            </span>
            <h1 className="animate-fade-up delay-100 text-3xl font-extrabold drop-shadow-sm md:text-4xl">الوظائف</h1>
            <p className="animate-fade-up delay-200 mt-2 text-tint">
              {loading ? "جارٍ التحميل…" : `${count.toLocaleString("ar-EG")} وظيفة متاحة الآن`}
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
        <div className="flex-1 space-y-4">
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
                    <div className="mt-3 flex gap-2">
                      <div className="h-6 w-20 rounded-full bg-line" />
                      <div className="h-6 w-16 rounded-full bg-line" />
                    </div>
                    <div className="mt-3 h-4 w-full rounded bg-line" />
                    <div className="mt-2 h-4 w-1/2 rounded bg-line" />
                  </div>
                </div>
              </div>
            ))}

          {/* error state */}
          {!loading && error && (
            <div className="card py-14 text-center">
              <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-warn-t text-[26px] text-warn"><AlertIcon /></div>
              <p className="mt-3 font-bold">تعذّر تحميل الوظائف</p>
              <p className="text-sm text-sub">تحقّق من اتصالك ثم حاول مجددًا</p>
              <button onClick={load} className="btn-secondary mt-4 text-sm">إعادة المحاولة</button>
            </div>
          )}

          {/* results */}
          {!loading && !error &&
            jobs?.results.map((job) => {
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
                      <button
                        type="button"
                        className={`shrink-0 rounded-full p-1.5 text-[18px] transition ${saved[job.id] ? "bg-tint text-primary" : "text-sub hover:bg-tint hover:text-primary"}`}
                        title="أضف لقائمة المتابعة"
                        aria-pressed={!!saved[job.id]}
                        onClick={() => toggleWatch(job)}
                      >
                        <BookmarkIcon filled={!!saved[job.id]} />
                      </button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="chip bg-tint text-primary-dark">{job.category_name}</span>
                      <span className="meta">
                        <MapPinIcon className="text-[15px] text-primary/70" />
                        {LOCATION_LABEL[job.location_type] ?? job.location_type}
                        {job.city ? ` · ${job.city}` : ""}
                      </span>
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
                          <span className="tag-soft bg-bg text-sub">+{(skills.length - 5).toLocaleString("ar-EG")}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                      <WalletIcon className="text-[17px] text-success" />
                      <span dir="ltr">{job.budget_min}–{job.budget_max}</span>
                      <span className="text-xs font-medium text-sub">د.ك</span>
                    </span>
                    <span className="meta">
                      <UsersIcon className="text-[16px]" /> {job.proposals_count.toLocaleString("ar-EG")} عروض
                    </span>
                  </div>
                  <Link href={`/jobs/${job.slug}`} className="btn-primary group/btn gap-1.5 px-4 py-1.5 text-sm">
                    قدّم عرضك
                    <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
                  </Link>
                </div>
              </article>
              );
            })}

          {/* empty state */}
          {!loading && !error && jobs && jobs.results.length === 0 && (
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

        <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-6 lg:w-80 lg:self-start">
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
              <p className="mb-1 text-xs font-medium text-sub">الفئة</p>
              <label className={`filter-row ${category === "" ? "filter-row-active" : ""}`}>
                <input type="radio" name="cat" className="accent-primary" checked={category === ""} onChange={() => pickCategory("")} />
                كل الفئات
              </label>
              {categories.map((c) => (
                <label key={c.id} className={`filter-row ${category === String(c.id) ? "filter-row-active" : ""}`}>
                  <input type="radio" name="cat" className="accent-primary" checked={category === String(c.id)}
                    onChange={() => pickCategory(String(c.id))} />
                  <CategoryIcon slug={c.slug} className="text-[18px] text-primary" /> {c.name_ar}
                </label>
              ))}
            </div>

            {subcats.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-sub">التخصص الفرعي</p>
                <select
                  className="field"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                >
                  <option value="">كل التخصصات</option>
                  {subcats.map((s) => (
                    <option key={s.id} value={s.id}>{s.name_ar}</option>
                  ))}
                </select>
              </div>
            )}
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
        </aside>
      </div>
    </main>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>}>
      <JobsInner />
    </Suspense>
  );
}

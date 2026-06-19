"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { AlertIcon, ArrowLeftIcon, BriefcaseIcon, ClockIcon, HeartIcon, SearchIcon, SparklesIcon } from "@/components/icons";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ListingStat, ListingStats, ListingFooter } from "@/components/ListingCard";

type Service = {
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
type Category = { id: number; slug: string; name_ar: string; icon: string; children: Category[] };

export default function ServicesPage() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [q, setQ] = useState("");
  const [ordering, setOrdering] = useState("-published_at");

  const subcats = categories.find((c) => String(c.id) === category)?.children ?? [];
  const activeCat = categories.find((c) => String(c.id) === category);
  const activeSub = subcats.find((c) => String(c.id) === subcategory);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ ordering });
      if (category) params.set("category", category);
      if (subcategory) params.set("subcategory", subcategory);
      if (q) params.set("search", q);
      const res = await fetch(`${API_URL}/services?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results?: Service[] };
      setServices(Array.isArray(data?.results) ? data.results : []);
    } catch {
      setError(true);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [category, subcategory, q, ordering]);

  useEffect(() => {
    fetch(`${API_URL}/categories`)
      .then(async (r) => (r.ok ? setCategories(await r.json()) : undefined))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, subcategory, ordering]);
  // Live search: debounced auto-apply (consistent with the category/sort filters).
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

  function pickCategory(id: string) {
    setCategory(id);
    setSubcategory("");
  }
  function clearFilters() {
    setCategory("");
    setSubcategory("");
    setQ("");
  }

  const count = services?.length ?? 0;

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
              {loading ? "جارٍ التحميل…" : "خدمات جاهزة بسعر ثابت — اطلبها واشترِها مباشرة."}
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
              <button onClick={load} className="btn-secondary mt-4 text-sm">إعادة المحاولة</button>
            </div>
          )}

          {/* results */}
          {!loading && !error && count > 0 && (
            <>
              <p className="text-sm text-sub">{count.toLocaleString("ar-EG")} خدمة</p>
              <div className="space-y-4">
                {services!.map((s) => {
                  const posted = timeAgo(s.created_at);
                  return (
                  <Link
                    key={s.id}
                    href={`/services/${s.slug}`}
                    className="card-modern group block p-5"
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
                        <h3 className="text-lg font-bold leading-snug transition group-hover:text-primary-dark">
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
                      <span className="btn-primary group/btn gap-1.5 px-4 py-1.5 text-sm">
                        اطلب الخدمة
                        <ArrowLeftIcon className="text-[16px] transition-transform group-hover/btn:-translate-x-0.5" />
                      </span>
                    </ListingFooter>
                  </Link>
                  );
                })}
              </div>
            </>
          )}

          {/* empty state */}
          {!loading && !error && count === 0 && (
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
                placeholder="ابحث عن خدمة…"
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
                <input type="radio" name="scat" className="accent-primary" checked={category === ""} onChange={() => pickCategory("")} />
                كل الفئات
              </label>
              {categories.map((c) => (
                <label key={c.id} className={`filter-row ${category === String(c.id) ? "filter-row-active" : ""}`}>
                  <input type="radio" name="scat" className="accent-primary" checked={category === String(c.id)}
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
        </aside>
      </div>
    </main>
  );
}

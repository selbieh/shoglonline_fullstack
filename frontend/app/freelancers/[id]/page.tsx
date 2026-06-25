import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment, personLd, breadcrumbLd, freelancerMetaDescription } from "@/lib/seo";
import type { FreelancerDetail } from "@/lib/types";
import Avatar from "@/components/Avatar";
import StarRating from "@/components/StarRating";
import ServiceCard, { type ServiceCardData } from "@/components/ServiceCard";
import PortfolioCard from "@/components/PortfolioCard";
import ReviewCard from "@/components/ReviewCard";
import { BadgeCheckIcon, BriefcaseIcon, ClockIcon, GridIcon, MapPinIcon, PlayIcon, StarIcon } from "@/components/icons";
import ProfileActions from "./ProfileActions";

const PROF: Record<string, string> = { basic: "أساسية", advanced: "جيد جدًا", native: "اللغة الأم" };
const AVAIL: Record<string, { t: string; cls: string }> = {
  available_now: { t: "متاح للعمل", cls: "bg-success-t text-success" },
  available_soon: { t: "متاح قريبًا", cls: "bg-warn-t text-warn" },
  unavailable: { t: "غير متاح حاليًا", cls: "bg-line/60 text-sub" },
};

/* Server-rendered public freelancer profile (SEO) — laid out to match the deck profile (slide-12):
   a profile hero (banner + overlapping avatar + name/title/rating/stats + hire/message) over a
   content column (overview, skills, services, reviews, portfolio) beside a CV rail. Read-only; the
   owner edits via /me/profile. No external contact is shown (ppt slide-01). Degrades gracefully when
   the profile is sparse (no «$—», no alarming "not verified"). */

async function getFreelancer(id: string): Promise<FreelancerDetail | null> {
  return serverApi<FreelancerDetail>(`/freelancers/${encodeSegment(id)}`, 60);
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const f = await getFreelancer(params.id);
  if (!f) return { title: "مستقل غير موجود" };
  const description = freelancerMetaDescription({
    name: f.name,
    bio_title: f.bio_title,
    overview: f.overview,
    skills: f.skills?.map((s) => s.name),
    city: f.city,
    country: f.country,
    rating_avg: f.rating_avg,
    rating_count: f.rating_count,
  });
  return {
    title: f.name,
    description,
    alternates: { canonical: `/freelancers/${f.id}` },
    openGraph: { type: "profile", title: f.name, description, url: `${SITE_URL}/freelancers/${f.id}` },
    twitter: { card: "summary_large_image", title: f.name, description },
  };
}

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-3 text-base font-extrabold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function HeroStat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sub">
        <span className="text-[14px] text-primary">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 text-base font-extrabold text-ink" dir="auto">{value}</div>
    </div>
  );
}

export default async function FreelancerDetailPage({ params }: { params: { id: string } }) {
  const f = await getFreelancer(params.id);
  if (!f) notFound();

  const servicesResp = await serverApi<{ results: ServiceCardData[] }>(`/services?worker=${f.id}`, 60);
  const services = servicesResp?.results ?? [];

  const rated = Number(f.rating_count) > 0;
  const location = [f.city, f.country].filter(Boolean).join(" - ");
  const avail = f.availability ? AVAIL[f.availability] : undefined;
  const reviews = f.reviews ?? [];
  const certs = f.certificates ?? [];
  const portfolio = f.portfolio ?? [];

  return (
    <main className="bg-bg">
      <JsonLd data={[
        personLd(f),
        breadcrumbLd([
          { name: "الرئيسية", path: "/" },
          { name: "المستقلون", path: "/freelancers" },
          { name: f.name, path: `/freelancers/${f.id}` },
        ]),
      ]} />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <a href="/freelancers" className="text-sm font-medium text-primary-dark hover:underline">← كل المستقلين</a>

        {/* ── HERO (deck slide-12: clean white card, identity on the right, stats + actions on the left) ── */}
        <section className="card mt-4">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* identity (right in RTL) */}
            <div className="flex items-start gap-4 lg:w-[330px] lg:shrink-0">
              <div className="relative shrink-0">
                <Avatar name={f.name} src={f.avatar_url} className="h-20 w-20 ring-2 ring-line" textClassName="text-2xl" />
                {f.availability === "available_now" && (
                  <span className="absolute bottom-0.5 left-0.5 h-4 w-4 rounded-full border-2 border-white bg-success" title="متاح الآن" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xl font-extrabold leading-tight text-ink sm:text-2xl">{f.name}</h1>
                  {f.is_verified && <BadgeCheckIcon className="shrink-0 text-[18px] text-primary" />}
                </div>
                {f.bio_title && <p className="mt-0.5 font-bold text-primary-dark">{f.bio_title}</p>}
                {f.overview && <p className="mt-2 line-clamp-2 text-sm leading-6 text-sub">{f.overview}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sub">
                  {location && <span className="inline-flex items-center gap-1"><MapPinIcon className="text-[13px] text-primary" /> {location}</span>}
                  {avail && <span className="inline-flex items-center gap-1"><ClockIcon className="text-[13px] text-primary" /> {avail.t}</span>}
                </div>
              </div>
            </div>

            {/* stats + actions (left) */}
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <HeroStat icon={<StarIcon filled />} label="التقييم العام"
                  value={rated ? <span dir="ltr">{Number(f.rating_avg).toFixed(1)} <span className="text-xs font-normal text-sub">({f.rating_count.toLocaleString("ar-EG")})</span></span> : "جديد"} />
                <HeroStat icon={<GridIcon />} label="أعمال المعرض" value={portfolio.length.toLocaleString("ar-EG")} />
                <HeroStat icon={<BriefcaseIcon />} label="الخدمات" value={services.length.toLocaleString("ar-EG")} />
                <HeroStat icon={<ClockIcon />} label="سنوات الخبرة" value={f.years_experience != null ? f.years_experience.toLocaleString("ar-EG") : "—"} />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <span className="text-xs text-sub">سعر الساعة</span>
                <span className="text-xl font-extrabold text-primary" dir="ltr">{f.hourly_rate ? `$${f.hourly_rate}` : "عند الطلب"}</span>
                {f.is_verified && (
                  <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-success-t px-3 py-1 text-xs font-bold text-success">
                    <BadgeCheckIcon className="text-[14px]" /> هوية محققة
                  </span>
                )}
              </div>

              {/* hire / message (others view) — ProfileActions handles self vs other */}
              <ProfileActions profileId={f.id} />
            </div>
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
          {/* ── MAIN column ── */}
          <div className="order-2 space-y-6 lg:order-1">
            {f.overview && (
              <section className="card">
                <h2 className="mb-3 text-lg font-extrabold text-ink">نبذة عني</h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-ink/80">{f.overview}</p>
              </section>
            )}

            {f.skills.length > 0 && (
              <section className="card">
                <h2 className="mb-3 text-lg font-extrabold text-ink">المهارات</h2>
                <div className="flex flex-wrap gap-2">
                  {f.skills.map((s) => (
                    <span key={s.skill_id} className="rounded-full bg-tint px-3 py-1.5 text-sm font-medium text-primary-dark">{s.name}</span>
                  ))}
                </div>
              </section>
            )}

            {services.length > 0 && (
              <section className="card">
                <h2 className="mb-4 text-lg font-extrabold text-ink">الخدمات المقدمة</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {services.map((s) => <ServiceCard key={s.id} service={s} />)}
                </div>
              </section>
            )}

            {reviews.length > 0 && (
              <section className="card">
                <h2 className="mb-4 text-lg font-extrabold text-ink">آراء العملاء</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
                </div>
              </section>
            )}

            {portfolio.length > 0 && (
              <section className="card">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-ink">
                  <GridIcon className="text-[18px] text-primary" /> سابقة الأعمال
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  {portfolio.map((p) => (
                    <PortfolioCard key={p.id} item={p} href={`/freelancers/${f.id}/portfolio/${p.id}`} />
                  ))}
                </div>
              </section>
            )}

            {/* graceful state when the public profile carries almost nothing */}
            {!f.overview && f.skills.length === 0 && services.length === 0 && portfolio.length === 0 && reviews.length === 0 && (
              <section className="card py-12 text-center text-sub">
                <p className="font-bold text-ink">لم يضف هذا المستقل تفاصيل بعد</p>
                <p className="mt-1 text-sm">يمكنك التواصل معه مباشرة لمعرفة المزيد عن خدماته.</p>
              </section>
            )}
          </div>

          {/* ── RIGHT rail (CV) ── */}
          <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-6 lg:self-start">
            {f.intro_video && (
              <RailSection title="الفيديو التقديمي">
                <a href={f.intro_video} target="_blank" rel="noopener noreferrer"
                  className="group flex aspect-video items-center justify-center rounded-m bg-ink/90 text-white transition hover:bg-ink">
                  <span className="grid h-12 w-12 place-content-center rounded-full bg-white/20 text-2xl backdrop-blur transition group-hover:scale-110">
                    <PlayIcon />
                  </span>
                </a>
              </RailSection>
            )}

            {f.languages.length > 0 && (
              <RailSection title="اللغات">
                <ul className="space-y-1.5 text-sm">
                  {f.languages.map((l, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="text-ink">{l.name}</span>
                      <span className="text-xs text-sub">{PROF[l.proficiency] ?? l.proficiency}</span>
                    </li>
                  ))}
                </ul>
              </RailSection>
            )}

            {f.educations.length > 0 && (
              <RailSection title="التعليم">
                <ul className="space-y-3 text-sm">
                  {f.educations.map((ed, i) => (
                    <li key={i}>
                      <p className="font-bold text-ink">{ed.school}</p>
                      <p className="text-xs text-sub">
                        {[ed.degree, ed.area_of_study].filter(Boolean).join(" · ")}
                        {(ed.date_from || ed.date_to) && ` · ${ed.date_from} – ${ed.date_to || ""}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </RailSection>
            )}

            {f.employments.length > 0 && (
              <RailSection title="الخبرات">
                <ul className="space-y-3 text-sm">
                  {f.employments.map((e, i) => (
                    <li key={i}>
                      <p className="font-bold text-ink">{e.job_title}</p>
                      <p className="text-xs text-sub">
                        {e.company}
                        {(e.period_from || e.period_to) && ` · ${e.period_from} – ${e.period_to || "الآن"}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </RailSection>
            )}

            {certs.length > 0 && (
              <RailSection title="الشهادات">
                <ul className="space-y-3 text-sm">
                  {certs.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-ink">{c.name}</p>
                        <p className="truncate text-xs text-sub">{[c.issuer, c.issued_year ? String(c.issued_year) : ""].filter(Boolean).join(" · ")}</p>
                      </div>
                      {c.verification_link && (
                        <a href={c.verification_link} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 rounded-m bg-tint px-2.5 py-1 text-xs font-medium text-primary-dark transition hover:bg-primary hover:text-white">عرض</a>
                      )}
                    </li>
                  ))}
                </ul>
              </RailSection>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

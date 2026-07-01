import type { ReactNode } from "react";
import { type FreelancerDetail, EXPERTISE_LABEL } from "@/lib/types";
import Avatar from "@/components/Avatar";
import CoverImage from "@/components/CoverImage";
import StarRating from "@/components/StarRating";
import ServiceCard, { type ServiceCardData } from "@/components/ServiceCard";
import PortfolioCard from "@/components/PortfolioCard";
import ReviewCard from "@/components/ReviewCard";
import { BadgeCheckIcon, BarChartIcon, BriefcaseIcon, ClockIcon, GridIcon, MapPinIcon, PlayIcon, SparklesIcon, StarIcon, UserIcon, WalletIcon } from "@/components/icons";
import { formatUSD } from "@/lib/currency";

/* Presentational freelancer profile — the canonical "as employers see it" layout (deck slide-12):
   a profile hero (banner + overlapping avatar + name/title/rating/stats + actions) over a content
   column (overview, skills, services, reviews, portfolio) beside a CV rail. Read-only and shared by:
   - the public SEO page (/freelancers/[id]) — data fetched unauthenticated, only when published;
   - the owner's preview (/me/profile/preview) — the owner's own data via the authed preview
     endpoint, so a draft can be previewed before publishing.
   Keeping a single component means the preview can never drift from the real public profile. Degrades
   gracefully when the profile is sparse (no «$—», no alarming "not verified"). */

/* Language proficiency → Arabic label + a 1–3 strength used for the level bar. */
const LANG: Record<string, { label: string; level: number }> = {
  basic: { label: "أساسية", level: 1 },
  advanced: { label: "جيد جدًا", level: 2 },
  native: { label: "اللغة الأم", level: 3 },
};
/* Skill efficiency → Arabic label + a 1–3 strength for the proficiency dots. */
const SKILL_EFF: Record<string, { label: string; level: number }> = {
  beginner: { label: "مبتدئ", level: 1 },
  basic: { label: "مبتدئ", level: 1 },
  intermediate: { label: "متوسط", level: 2 },
  advanced: { label: "متقدم", level: 3 },
  expert: { label: "خبير", level: 3 },
};
const AVAIL: Record<string, { t: string; cls: string }> = {
  available_now: { t: "متاح للعمل", cls: "bg-success-t text-success" },
  available_soon: { t: "متاح قريبًا", cls: "bg-warn-t text-warn" },
  unavailable: { t: "غير متاح حاليًا", cls: "bg-line/60 text-sub" },
};

function RailSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-ink">
        {icon && <span className="text-[16px] text-primary">{icon}</span>}
        {title}
      </h2>
      {children}
    </div>
  );
}

/* A stat tile in the hero — tinted icon chip + label + emphasised value. */
function HeroStat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="rounded-m border border-line/70 bg-bg/60 p-3">
      <div className="flex items-center gap-2 text-sub">
        <span className="icon-tile h-7 w-7 text-[14px]">{icon}</span>
        <span className="text-[11px] font-medium leading-tight">{label}</span>
      </div>
      <div className="mt-1.5 text-lg font-extrabold text-ink" dir="auto">{value}</div>
    </div>
  );
}

/* A labelled fact row for the rail "لمحة سريعة" card. */
function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-sub"><span className="text-[15px] text-primary">{icon}</span>{label}</span>
      <span className="text-left font-bold text-ink" dir="auto">{value}</span>
    </li>
  );
}

/* 3-dot proficiency indicator (skills). */
function LevelDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" dir="ltr" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? "bg-primary" : "bg-primary/25"}`} />
      ))}
    </span>
  );
}

export default function FreelancerProfileView({
  f,
  services,
  actions,
  headerSlot,
}: {
  f: FreelancerDetail;
  services: ServiceCardData[];
  /** Hire / edit CTA shown in the hero (public: <ProfileActions>; preview: a disabled hire button). */
  actions?: ReactNode;
  /** Optional slot above the hero (public: «← كل المستقلين»; preview: the preview banner). */
  headerSlot?: ReactNode;
}) {
  const rated = Number(f.rating_count) > 0;
  const location = [f.city, f.country].filter(Boolean).join(" - ");
  const avail = f.availability ? AVAIL[f.availability] : undefined;
  const reviews = f.reviews ?? [];
  const certs = f.certificates ?? [];
  const portfolio = f.portfolio ?? [];
  const expertise = f.expertise_level ? EXPERTISE_LABEL[f.expertise_level] : undefined;
  const earned = Number(f.total_earned) > 0 ? f.total_earned : undefined;

  return (
    <main className="bg-bg">
      <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6">
        {headerSlot}

        {/* ── HERO (deck slide-12) — branded cover banner, an overlapping avatar, identity on the
              right with stats + actions on the left. Cover image when supplied, else a brand gradient. ── */}
        <section className="card mt-4 overflow-hidden p-0">
          <div className="relative h-28 bg-hero sm:h-36">
            {f.cover_image && <CoverImage src={f.cover_image} className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0 dots opacity-30" />
          </div>

          <div className="px-5 pb-5">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              {/* identity (right in RTL) */}
              <div className="lg:w-[330px] lg:shrink-0">
                <div className="relative -mt-14 w-fit shrink-0">
                  <Avatar name={f.name} src={f.avatar_url} className="h-24 w-24 ring-4 ring-white shadow-card" textClassName="text-3xl" />
                  {f.availability === "available_now" && (
                    <span className="absolute bottom-1.5 start-1.5 h-5 w-5 rounded-full border-[3px] border-white bg-success" title="متاح الآن" />
                  )}
                </div>
                <div className="mt-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <h1 className="text-xl font-extrabold leading-tight text-ink sm:text-2xl">{f.name}</h1>
                    {f.is_verified && <BadgeCheckIcon className="shrink-0 text-[18px] text-primary" />}
                    {expertise && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-xs font-bold text-primary-dark">
                        <SparklesIcon className="text-[12px]" /> {expertise}
                      </span>
                    )}
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
              <div className="flex-1 lg:pt-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <HeroStat icon={<StarIcon filled />} label="التقييم العام"
                    value={rated ? <span dir="ltr">{Number(f.rating_avg).toFixed(1)} <span className="text-xs font-normal text-sub">({f.rating_count.toLocaleString("en-US")})</span></span> : "جديد"} />
                  <HeroStat icon={<GridIcon />} label="أعمال المعرض" value={portfolio.length.toLocaleString("en-US")} />
                  <HeroStat icon={<BriefcaseIcon />} label="الخدمات" value={services.length.toLocaleString("en-US")} />
                  <HeroStat icon={<ClockIcon />} label="سنوات الخبرة" value={f.years_experience != null ? f.years_experience.toLocaleString("en-US") : "—"} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
                  <span className="text-xs text-sub">سعر الساعة</span>
                  <span className="text-xl font-extrabold text-primary">{f.hourly_rate ? formatUSD(f.hourly_rate) : "عند الطلب"}</span>
                  {rated && <StarRating value={Number(f.rating_avg)} count={f.rating_count} className="ms-1" />}
                  {f.is_verified && (
                    <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-success-t px-3 py-1 text-xs font-bold text-success">
                      <BadgeCheckIcon className="text-[14px]" /> هوية محققة
                    </span>
                  )}
                </div>

                {/* hire / message (others view) — provided by the caller (self vs other vs preview) */}
                {actions}
              </div>
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
                  {f.skills.map((s) => {
                    const eff = s.efficiency ? SKILL_EFF[s.efficiency.toLowerCase()] : undefined;
                    return (
                      <span key={s.skill_id} className="inline-flex items-center gap-2 rounded-full bg-tint px-3 py-1.5 text-sm font-medium text-primary-dark"
                        title={eff ? eff.label : undefined}>
                        {s.name}
                        {eff && <LevelDots level={eff.level} />}
                      </span>
                    );
                  })}
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
                <span className="mx-auto grid h-12 w-12 place-content-center rounded-full bg-tint text-2xl text-primary"><UserIcon /></span>
                <p className="mt-3 font-bold text-ink">لم يضف هذا المستقل تفاصيل بعد</p>
                <p className="mt-1 text-sm">يمكنك توظيفه مباشرة لبدء العمل والاطلاع على مهاراته عن قرب.</p>
              </section>
            )}
          </div>

          {/* ── RIGHT rail (CV) ── */}
          <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-20 lg:self-start">
            {/* quick-facts — keeps the rail informative even when the CV sections are sparse */}
            <RailSection title="لمحة سريعة" icon={<SparklesIcon />}>
              <ul className="space-y-2.5 text-sm">
                <InfoRow icon={<WalletIcon />} label="سعر الساعة" value={f.hourly_rate ? formatUSD(f.hourly_rate) : "عند الطلب"} />
                <InfoRow icon={<StarIcon filled />} label="التقييم" value={rated ? <span dir="ltr">{Number(f.rating_avg).toFixed(1)} / 5</span> : "جديد"} />
                {avail && <InfoRow icon={<ClockIcon />} label="الحالة" value={avail.t} />}
                {expertise && <InfoRow icon={<SparklesIcon />} label="مستوى الخبرة" value={expertise} />}
                {location && <InfoRow icon={<MapPinIcon />} label="الموقع" value={location} />}
                {earned && <InfoRow icon={<BarChartIcon />} label="إجمالي الأرباح" value={formatUSD(earned)} />}
                {f.is_verified && <InfoRow icon={<BadgeCheckIcon />} label="التوثيق" value={<span className="text-success">هوية محققة</span>} />}
              </ul>
            </RailSection>

            {f.intro_video && (
              <RailSection title="الفيديو التقديمي" icon={<PlayIcon />}>
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
                <ul className="space-y-3 text-sm">
                  {f.languages.map((l, i) => {
                    const lang = LANG[l.proficiency];
                    return (
                      <li key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-ink">{l.name}</span>
                          <span className="text-xs text-sub">{lang?.label ?? l.proficiency}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-line">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${((lang?.level ?? 3) / 3) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
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

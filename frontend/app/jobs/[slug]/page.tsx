import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment, jobIsIndexable, jobPostingLd } from "@/lib/seo";
import { LOCATION_LABEL, type Job } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import {
  MapPinIcon, UsersIcon, UserIcon, WalletIcon, ClockIcon, GridIcon,
  AlertIcon, BadgeCheckIcon, SparklesIcon, ClipboardIcon, LightbulbIcon,
} from "@/components/icons";
import ProposalForm from "./ProposalForm";

/* Server-rendered job detail (SEO): full content + metadata + JobPosting JSON-LD.
   The proposal form is a client island. */

async function getJob(slug: string): Promise<Job | null> {
  return serverApi<Job>(`/jobs/${encodeSegment(slug)}`, 60);
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const job = await getJob(params.slug);
  if (!job) return { title: "وظيفة غير موجودة" };
  const description = (job.description || "").slice(0, 160);
  const url = `${SITE_URL}/jobs/${job.slug}`;
  return {
    title: job.title,
    description,
    alternates: { canonical: `/jobs/${job.slug}` },
    openGraph: { type: "article", title: job.title, description, url },
    twitter: { card: "summary", title: job.title, description },
    // expired/closed postings drop out of the index (FR-JOB-17 / §17)
    robots: jobIsIndexable(job) ? undefined : { index: false, follow: true },
  };
}

/* compact icon-tile fact used across the overview grid */
function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-m border border-line/70 bg-bg/60 p-3">
      <span className="icon-tile h-9 w-9 shrink-0 text-[17px]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-sub">{label}</span>
        <span className="block truncate text-sm font-bold text-ink">{value}</span>
      </span>
    </div>
  );
}

export default async function JobDetailPage({ params }: { params: { slug: string } }) {
  const job = await getJob(params.slug);
  if (!job) notFound();

  const jsonLd = jobPostingLd(job);
  const posted = timeAgo(job.published_at ?? job.created_at);
  const expires = timeAgo(job.expires_at);
  const onsite = job.location_type !== "remote";
  const place = [job.city, job.country].filter(Boolean).join(" - ");
  const reqQuestions = job.screening_questions?.filter((q) => q.is_required).length ?? 0;

  return (
    <main>
      <JsonLd data={jsonLd} />
      {/* gradient hero band */}
      <section className="bg-hero bg-spotlight text-white">
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-8">
          <p className="text-sm text-tint">
            <a href="/jobs" className="hover:underline">الوظائف</a>
            <span className="mx-1 opacity-60">/</span>
            {job.category_name}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight drop-shadow-sm md:text-4xl">{job.title}</h1>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1.5"><WalletIcon className="text-[15px]" /> ${job.budget_min}–${job.budget_max}</span>
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1.5"><MapPinIcon className="text-[15px]" /> {LOCATION_LABEL[job.location_type]}{onsite && place ? ` · ${place}` : ""}</span>
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1.5"><UsersIcon className="text-[15px]" /> {job.proposals_count} عروض</span>
            {posted && <span className="glass inline-flex items-center gap-1.5 px-3 py-1.5"><ClockIcon className="text-[15px]" /> نُشرت {posted}</span>}
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-6 flex max-w-6xl flex-col gap-6 px-6 pb-12 lg:flex-row lg:items-start">
        {/* ── job details (enriched) ── */}
        <div className="flex-1 space-y-6">
          {/* overview facts */}
          <section className="card">
            <h2 className="section-head mb-4 text-lg font-bold gradient-text">
              <span className="inline-flex items-center gap-2"><ClipboardIcon className="text-[18px] text-primary" /> تفاصيل الوظيفة</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Fact icon={<WalletIcon />} label="الميزانية" value={`$${job.budget_min}–$${job.budget_max}`} />
              <Fact icon={<MapPinIcon />} label="نوع العمل" value={onsite && place ? `${LOCATION_LABEL[job.location_type]} · ${place}` : LOCATION_LABEL[job.location_type]} />
              <Fact icon={<GridIcon />} label="التصنيف" value={job.category_name} />
              <Fact icon={<UsersIcon />} label="العروض المقدّمة" value={`${job.proposals_count} عرض`} />
              {posted && <Fact icon={<ClockIcon />} label="تاريخ النشر" value={posted} />}
              {expires && <Fact icon={<AlertIcon />} label="ينتهي التقديم" value={expires} />}
            </div>
          </section>

          {/* description */}
          <section className="card">
            <h2 className="mb-3 text-base font-bold text-ink">وصف الوظيفة</h2>
            {job.description ? (
              <p className="whitespace-pre-line text-[15px] leading-8 text-ink/90">{job.description}</p>
            ) : (
              <p className="text-sm text-sub">لم يُضِف صاحب العمل وصفًا تفصيليًا لهذه الوظيفة.</p>
            )}
          </section>

          {/* skills */}
          {(job.skill_names?.length ?? 0) > 0 && (
            <section className="card">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink">
                <SparklesIcon className="text-[17px] text-primary" /> المهارات المطلوبة
              </h2>
              <div className="flex flex-wrap gap-2">
                {job.skill_names!.map((s) => (
                  <span key={s} className="chip">{s}</span>
                ))}
              </div>
            </section>
          )}

          {/* employer + screening summary */}
          <section className="card">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-content-center rounded-full bg-tint text-lg font-extrabold text-primary-deep">
                {(job.employer_name || "؟").trim().charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-bold text-ink">
                  {job.employer_name || "صاحب العمل"}
                  <BadgeCheckIcon className="text-[15px] text-primary" />
                </p>
                <p className="text-xs text-sub">صاحب العمل · {job.proposals_count} عرض على هذه الوظيفة</p>
              </div>
            </div>
            {reqQuestions > 0 && (
              <p className="meta mt-4 border-t border-line/70 pt-3">
                <AlertIcon className="text-[15px] text-primary" />
                يطلب صاحب العمل الإجابة عن {reqQuestions} {reqQuestions === 1 ? "سؤال إلزامي" : "أسئلة إلزامية"} عند التقديم.
              </p>
            )}
          </section>

          {/* tips for a strong proposal */}
          <section className="card bg-tint/40">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-primary-deep">
              <LightbulbIcon className="text-[17px] text-primary" /> نصائح لعرض ناجح
            </h2>
            <ul className="space-y-2 text-sm text-primary-dark">
              <li className="flex gap-2"><span className="text-primary">•</span> اشرح خطّتك خطوة بخطوة وحدّد المخرجات المتوقّعة.</li>
              <li className="flex gap-2"><span className="text-primary">•</span> اقترح سعرًا ومدة تسليم واقعيّين ضمن ميزانية الوظيفة.</li>
              <li className="flex gap-2"><span className="text-primary">•</span> أبرز أعمالًا سابقة مشابهة ليثق بك صاحب العمل.</li>
            </ul>
          </section>
        </div>

        {/* ── proposal form (sticky sidebar) ── */}
        <section className="card w-full shrink-0 space-y-4 lg:sticky lg:top-6 lg:w-[440px]">
          <div className="-mx-5 -mt-5 mb-1 rounded-t-l bg-hero px-5 py-4 text-white">
            <h2 className="text-lg font-bold">قدّم عرضك</h2>
            <p className="mt-0.5 text-xs text-tint">أبرز ما يميّزك واربح المشروع</p>
          </div>
          <ProposalForm job={job} />
        </section>
      </div>
    </main>
  );
}

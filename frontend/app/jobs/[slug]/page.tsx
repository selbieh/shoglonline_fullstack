import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment, jobIsIndexable, jobPostingLd } from "@/lib/seo";
import { LOCATION_LABEL, type Job } from "@/lib/types";
import { MapPinIcon, UsersIcon, UserIcon, WalletIcon } from "@/components/icons";
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

export default async function JobDetailPage({ params }: { params: { slug: string } }) {
  const job = await getJob(params.slug);
  if (!job) notFound();

  const jsonLd = jobPostingLd(job);

  return (
    <main>
      <JsonLd data={jsonLd} />
      {/* gradient hero band */}
      <section className="bg-hero text-white">
        <div className="mx-auto max-w-6xl px-6 pb-10 pt-8">
          <p className="text-sm text-tint">
            <a href="/jobs" className="hover:underline">الوظائف</a> / {job.category_name}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold drop-shadow-sm">{job.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1"><WalletIcon className="text-[15px]" /> {job.budget_min}–{job.budget_max} د.ك</span>
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1"><MapPinIcon className="text-[15px]" /> {LOCATION_LABEL[job.location_type]}</span>
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1"><UsersIcon className="text-[15px]" /> {job.proposals_count} عروض</span>
            <span className="glass inline-flex items-center gap-1.5 px-3 py-1"><UserIcon className="text-[15px]" /> {job.employer_name}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-6 flex max-w-6xl flex-col gap-6 px-6 pb-12 lg:flex-row">
        <section className="card flex-1">
          <h2 className="mb-3 font-bold gradient-text">تفاصيل الوظيفة</h2>
          <p className="whitespace-pre-line text-sm leading-7">{job.description}</p>
        </section>

        <section className="card w-full shrink-0 space-y-4 lg:w-[440px]">
          <h2 className="text-lg font-bold">قدّم عرضك</h2>
          <ProposalForm job={job} />
        </section>
      </div>
    </main>
  );
}

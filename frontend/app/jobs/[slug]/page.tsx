import type { Metadata } from "next";
import { JsonLd, SITE_URL, serverApi, encodeSegment, jobIsIndexable, jobPostingLd, breadcrumbLd, jobMetaDescription } from "@/lib/seo";
import { LOCATION_LABEL, type Job } from "@/lib/types";
import JobDetailBody from "./JobDetailBody";
import PrivateJobView from "./PrivateJobView";

/* Server-rendered job detail (SEO): full content + metadata + JobPosting JSON-LD.
   The proposal form is a client island. A private/invite-only job 404s the unauthenticated SSR
   fetch, so we hand off to PrivateJobView, which re-fetches with the viewer's token (FR-JOB-12). */

async function getJob(slug: string): Promise<Job | null> {
  return serverApi<Job>(`/jobs/${encodeSegment(slug)}`, 60);
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const job = await getJob(params.slug);
  // null = missing OR a private job the SSR (anonymous) fetch can't see — keep it out of the index.
  if (!job) return { title: "وظيفة غير متاحة", robots: { index: false, follow: false } };
  // editor SEO overrides win; otherwise fall back to the title / a description excerpt
  const title = job.meta_title || job.title;
  const description = job.meta_description || jobMetaDescription({
    title: job.title,
    description: job.description,
    category_name: job.category_name,
    location_label: LOCATION_LABEL[job.location_type],
    city: job.city,
    budget_min: job.budget_min,
    budget_max: job.budget_max,
  });
  const url = `${SITE_URL}/jobs/${job.slug}`;
  return {
    title,
    description,
    alternates: { canonical: `/jobs/${job.slug}` },
    openGraph: { type: "article", title, description, url },
    twitter: { card: "summary_large_image", title, description },
    // expired/closed postings drop out of the index (FR-JOB-17 / §17)
    robots: jobIsIndexable(job) ? undefined : { index: false, follow: true },
  };
}

export default async function JobDetailPage({ params }: { params: { slug: string } }) {
  const job = await getJob(params.slug);
  // SSR is unauthenticated: a null result is either a missing job OR a private/invite-only one.
  // Hand off to the client fallback, which retries with the viewer's token (owner / invited worker).
  if (!job) return <PrivateJobView slug={params.slug} />;

  const jsonLd = [
    jobPostingLd(job),
    breadcrumbLd([
      { name: "الرئيسية", path: "/" },
      { name: "الوظائف", path: "/jobs" },
      { name: job.title, path: `/jobs/${job.slug}` },
    ]),
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <JobDetailBody job={job} />
    </>
  );
}

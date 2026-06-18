/** SEO helpers: server-side API fetch (over the internal docker network) + JSON-LD. */
import type { FreelancerDetail, Job } from "@/lib/types";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Server components fetch the backend over the internal network; localhost:8000 inside
// the frontend container points at the frontend itself.
const SERVER_API =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000/api/v1";

/**
 * Encode a dynamic route segment (slug/id) for a backend path, exactly once.
 *
 * Next.js hands `params.*` to server components already percent-encoded as it
 * appeared in the URL (e.g. an Arabic slug arrives as "%D8%AA…"). Calling
 * `encodeURIComponent` on that would double-encode ("%25D8%25AA…") and the
 * backend would 404 — which silently broke every non-ASCII job/service slug.
 * Decoding first normalises the input so we always emit a single, correct
 * level of encoding, whether the param arrives encoded (dev) or decoded.
 */
export function encodeSegment(segment: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    // Malformed %-sequence (shouldn't happen for real slugs) — pass through.
    return segment;
  }
}

export async function serverApi<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Renders a <script type="application/ld+json"> block for structured data. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// ---------------------------------------------------------------- structured-data builders (§17)
// Pure functions (unit-testable) so the JSON-LD shape is verified independently of the pages.

/** A job is indexable only while it's an open, unexpired posting (FR-JOB-17). Expired/closed
 * postings are marked noindex so crawlers drop them (the SSR-practical equivalent of a 410). */
export function jobIsIndexable(job: Pick<Job, "status" | "expires_at">): boolean {
  if (job.status && job.status !== "published") return false;
  if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) return false;
  return true;
}

/** schema.org JobPosting (with validThrough + EXPIRED status on expiry). */
export function jobPostingLd(job: Job): Record<string, unknown> {
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.published_at ?? undefined,
    validThrough: job.expires_at ?? undefined,
    employmentType: job.location_type === "remote" ? "CONTRACTOR" : "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: job.employer_name || "شغل أونلاين" },
    jobLocationType: job.location_type === "remote" ? "TELECOMMUTE" : undefined,
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: { "@type": "QuantitativeValue", minValue: job.budget_min, maxValue: job.budget_max, unitText: "PROJECT" },
    },
    url: `${SITE_URL}/jobs/${job.slug}`,
    ...(jobIsIndexable(job) ? {} : { jobPostingStatus: "EXPIRED" }),
  };
}

/** schema.org Person (with aggregateRating when the worker has reviews → Rich Results). */
export function personLd(f: FreelancerDetail): Record<string, unknown> {
  const rated = Number(f.rating_count) > 0;
  return {
    "@context": "https://schema.org/",
    "@type": "Person",
    name: f.name,
    jobTitle: f.bio_title || undefined,
    image: f.avatar_url || undefined,
    url: `${SITE_URL}/freelancers/${f.id}`,
    knowsAbout: f.skills?.length ? f.skills.map((s) => s.name) : undefined,
    ...(rated
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(f.rating_avg).toFixed(1), reviewCount: f.rating_count } }
      : {}),
  };
}

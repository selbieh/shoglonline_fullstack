/** SEO helpers: server-side API fetch (over the internal docker network) + JSON-LD. */
import type { FreelancerDetail, Job } from "@/lib/types";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Brand identity reused across structured data + OG images. */
export const ORG_NAME = "شغل أونلاين";
export const ORG_LOGO = `${SITE_URL}/logo.png`;
/** Official social profiles (Organization.sameAs → Knowledge Panel). Comma-separated env override. */
export const SAME_AS = (process.env.NEXT_PUBLIC_SOCIAL_LINKS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Absolute URL for a site-relative path (structured data must use absolute URLs). */
export function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Clean plain-text excerpt for a meta description fallback (used when an editor leaves
 * meta_description blank). Strips HTML/markdown, collapses whitespace, and trims on a word
 * boundary near `max` chars with an ellipsis — so a markdown/HTML body never leaks `#`, `*`,
 * tags, or a mid-word cut into the SERP snippet.
 */
export function metaExcerpt(raw: string, max = 160): string {
  const text = (raw || "")
    .replace(/<[^>]+>/g, " ") // HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // markdown images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // markdown links → label
    .replace(/[#>*_`~]+/g, " ") // heading / emphasis / code / quote markers
    .replace(/\s+/g, " ") // collapse whitespace + newlines
    .replace(/\s+([.,;:!؟،؛])/g, "$1") // drop space left before punctuation by stripping
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // trim to the last whole word (unless that throws away too much), then drop trailing punctuation
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!؟،؛-]+$/u, "")}…`;
}

// ---------------------------------------------------------------- meta-description fallbacks (§17)
// When an editor leaves meta_description blank we still want a STRONG, keyword-rich snippet — not a
// thin slice of body text. These builders prefer the entity's own copy when it's substantial, and
// otherwise compose a well-formed Arabic description from its structured attributes. Each result is
// clamped + cleaned by metaExcerpt so it's always SERP-safe (≤160, no markup, word-boundary).

const SUBSTANTIAL = 60; // chars: below this, the entity's own text is too thin to stand alone

/** SEO description for a service gig (price/delivery/category aware). */
export function serviceMetaDescription(s: {
  title: string; description?: string; category_name?: string;
  delivery_days?: number; base_price?: string | number; worker_name?: string;
}): string {
  const own = metaExcerpt(s.description || "");
  if (own.length >= SUBSTANTIAL) return own;
  const head = `خدمة ${s.title}${s.category_name ? ` في ${s.category_name}` : ""}`;
  const facts: string[] = [];
  if (s.delivery_days) facts.push(`التسليم خلال ${s.delivery_days} يوم`);
  if (s.base_price != null && `${s.base_price}` !== "") facts.push(`تبدأ من $${s.base_price}`);
  if (s.worker_name) facts.push(`من ${s.worker_name}`);
  return metaExcerpt(`${head}${facts.length ? ` — ${facts.join("، ")}` : ""}. اطلبها الآن على ${ORG_NAME}.`);
}

/** SEO description for a job posting (category/location/budget aware). */
export function jobMetaDescription(j: {
  title: string; description?: string; category_name?: string;
  location_label?: string; city?: string; budget_min?: string | number; budget_max?: string | number;
}): string {
  const own = metaExcerpt(j.description || "");
  if (own.length >= SUBSTANTIAL) return own;
  const head = `وظيفة ${j.title}${j.category_name ? ` - ${j.category_name}` : ""}`;
  const facts: string[] = [];
  if (j.location_label) facts.push(`${j.location_label}${j.city ? ` (${j.city})` : ""}`);
  if (j.budget_min != null && j.budget_max != null) facts.push(`الميزانية $${j.budget_min}–$${j.budget_max}`);
  return metaExcerpt(`${head}${facts.length ? `، ${facts.join("، ")}` : ""}. قدّم عرضك الآن على ${ORG_NAME}.`);
}

/** SEO description for a freelancer profile (headline/skills/location/rating aware). */
export function freelancerMetaDescription(f: {
  name: string; bio_title?: string; overview?: string; skills?: string[];
  city?: string; country?: string; rating_avg?: string | number; rating_count?: number;
}): string {
  const own = metaExcerpt(f.overview || "");
  if (own.length >= SUBSTANTIAL) return own;
  const head = `${f.name}${f.bio_title ? ` - ${f.bio_title}` : ""}`;
  const facts: string[] = [];
  const loc = [f.city, f.country].filter(Boolean).join("، ");
  if (loc) facts.push(loc);
  if (f.skills?.length) facts.push(`خبرة في ${f.skills.slice(0, 3).join("، ")}`);
  if (Number(f.rating_count) > 0) facts.push(`بتقييم ${Number(f.rating_avg).toFixed(1)}/5`);
  return metaExcerpt(`${head}${facts.length ? `، ${facts.join("، ")}` : ""}. وظّفه الآن على ${ORG_NAME}.`);
}

/** SEO description for a CMS page — its body excerpt, or a branded line if the body is empty. */
export function pageMetaDescription(p: { title: string; body?: string }): string {
  return metaExcerpt(p.body || "") || `${p.title} — ${ORG_NAME}، منصة الوظائف والخدمات الحرة.`;
}

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

/** schema.org Organization — the publisher identity (logo + social profiles → Knowledge Panel). */
export function organizationLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG_NAME,
    url: SITE_URL,
    logo: ORG_LOGO,
    ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
  };
}

/** schema.org WebSite with a SearchAction (enables the Google sitelinks search box). */
export function websiteLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: ORG_NAME,
    url: SITE_URL,
    inLanguage: "ar",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/services?search={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** schema.org BreadcrumbList from an ordered [{ name, path }] trail (rich-result breadcrumbs). */
export function breadcrumbLd(trail: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.path),
    })),
  };
}

/** schema.org Product/Offer for a service gig — with cover image, seller, and aggregateRating +
 * Review list when reviews exist (eligible for review-snippet rich results). */
export function serviceLd(s: {
  title: string; slug: string; description: string; base_price: string;
  cover_image?: string; worker_name?: string; category_name?: string;
  reviews?: { author_name: string; rating: number; comment?: string; created_at?: string }[];
}): Record<string, unknown> {
  const reviews = s.reviews ?? [];
  const ratingCount = reviews.length;
  const ratingValue = ratingCount
    ? (reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / ratingCount).toFixed(1)
    : null;
  return {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: s.title,
    description: s.description,
    image: s.cover_image ? absoluteUrl(s.cover_image) : undefined,
    category: s.category_name || undefined,
    brand: s.worker_name ? { "@type": "Brand", name: s.worker_name } : undefined,
    offers: {
      "@type": "Offer",
      price: s.base_price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/services/${s.slug}`,
      ...(s.worker_name ? { seller: { "@type": "Person", name: s.worker_name } } : {}),
    },
    ...(ratingValue
      ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue, reviewCount: ratingCount, bestRating: 5 },
          review: reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.author_name },
            datePublished: r.created_at || undefined,
            reviewBody: r.comment || undefined,
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
          })),
        }
      : {}),
  };
}

/** schema.org Article for a CMS content page (about/terms/blog…). */
export function articleLd(page: { slug: string; title: string; body: string; updated_at?: string }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: metaExcerpt(page.body, 200),
    inLanguage: "ar",
    url: `${SITE_URL}/pages/${page.slug}`,
    ...(page.updated_at ? { dateModified: page.updated_at } : {}),
    author: { "@type": "Organization", name: ORG_NAME },
    publisher: { "@type": "Organization", name: ORG_NAME, logo: { "@type": "ImageObject", url: ORG_LOGO } },
  };
}

/** schema.org CreativeWork for a single portfolio work (attributed to its freelancer). */
export function portfolioLd(args: {
  id: number; title: string; description?: string; image?: string;
  authorName?: string; authorId?: number; created_at?: string; keywords?: string[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: args.title,
    description: args.description || undefined,
    image: args.image ? absoluteUrl(args.image) : undefined,
    inLanguage: "ar",
    ...(args.created_at ? { dateCreated: args.created_at } : {}),
    ...(args.keywords?.length ? { keywords: args.keywords.join(", ") } : {}),
    ...(args.authorName
      ? { author: { "@type": "Person", name: args.authorName, ...(args.authorId ? { url: `${SITE_URL}/freelancers/${args.authorId}` } : {}) } }
      : {}),
  };
}

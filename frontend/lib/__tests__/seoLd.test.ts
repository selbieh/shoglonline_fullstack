import { describe, expect, it } from "vitest";

import { jobIsIndexable, jobPostingLd, personLd } from "@/lib/seo";
import type { FreelancerDetail, Job } from "@/lib/types";

const future = "2999-01-01T00:00:00Z";
const past = "2000-01-01T00:00:00Z";

const baseJob: Job = {
  id: 1, title: "تطوير", slug: "dev", description: "وصف", category: 1, category_name: "برمجة",
  budget_min: "100", budget_max: "500", location_type: "remote", country: "", city: "",
  status: "published", published_at: "2026-01-01T00:00:00Z", expires_at: future, proposals_count: 0,
};

const baseFreelancer: FreelancerDetail = {
  id: 7, name: "سعيد", avatar_url: "", bio_title: "مطوّر", expertise_level: "expert", hourly_rate: "20",
  rating_avg: "4.5", rating_count: 12, is_verified: true, overview: "نبذة",
  skills: [{ skill_id: 1, name: "بايثون", efficiency: "advanced" }], languages: [], educations: [], employments: [],
};

describe("JobPosting JSON-LD", () => {
  it("has the required schema.org shape + validThrough", () => {
    const ld = jobPostingLd(baseJob);
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.validThrough).toBe(future);
    expect(ld.title).toBe("تطوير");
    expect((ld.hiringOrganization as Record<string, unknown>)["@type"]).toBe("Organization");
  });

  it("marks an expired posting EXPIRED + non-indexable", () => {
    const expired = { ...baseJob, expires_at: past };
    expect(jobIsIndexable(expired)).toBe(false);
    expect(jobPostingLd(expired).jobPostingStatus).toBe("EXPIRED");
  });

  it("a closed (non-published) posting is not indexable", () => {
    expect(jobIsIndexable({ ...baseJob, status: "closed" })).toBe(false);
    expect(jobIsIndexable(baseJob)).toBe(true);
  });
});

describe("Person JSON-LD", () => {
  it("includes aggregateRating when the worker has reviews", () => {
    const ld = personLd(baseFreelancer);
    expect(ld["@type"]).toBe("Person");
    expect(ld.aggregateRating).toMatchObject({ "@type": "AggregateRating", reviewCount: 12 });
    expect(ld.knowsAbout).toContain("بايثون");
  });

  it("omits aggregateRating with no reviews (invalid Rich Result otherwise)", () => {
    const ld = personLd({ ...baseFreelancer, rating_count: 0 });
    expect(ld.aggregateRating).toBeUndefined();
  });
});

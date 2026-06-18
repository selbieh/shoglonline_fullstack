import { describe, expect, it } from "vitest";
import { encodeSegment } from "@/lib/seo";

/**
 * Regression guard for the double-encoding bug that 404'd every non-ASCII
 * (Arabic) job/service/CMS slug: Next.js hands route params already
 * percent-encoded, and the detail pages re-encoded them, so the backend
 * received "%25D8%25AA…" and could never find the row.
 */
describe("encodeSegment", () => {
  const arabic = "تطوير-متجر-إلكتروني-بـ-django-1";
  const encodedArabic = encodeURIComponent(arabic);

  it("encodes a raw (decoded) slug exactly once", () => {
    expect(encodeSegment(arabic)).toBe(encodedArabic);
  });

  it("does NOT double-encode an already-encoded slug (the bug)", () => {
    // This is how Next.js delivers params.slug in this setup.
    expect(encodeSegment(encodedArabic)).toBe(encodedArabic);
    expect(encodeSegment(encodedArabic)).not.toContain("%25");
  });

  it("is idempotent — re-applying yields the same single-encoded segment", () => {
    expect(encodeSegment(encodeSegment(arabic))).toBe(encodedArabic);
  });

  it("leaves plain ASCII ids/slugs unchanged", () => {
    expect(encodeSegment("3")).toBe("3");
    expect(encodeSegment("about")).toBe("about");
  });

  it("falls back to the raw input on a malformed %-sequence instead of throwing", () => {
    expect(() => encodeSegment("100%-cotton")).not.toThrow();
    expect(encodeSegment("100%-cotton")).toBe("100%-cotton");
  });
});

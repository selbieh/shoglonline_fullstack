import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";
import { serverApi, encodeSegment } from "@/lib/seo";

/* Per-freelancer social card: name + headline over the brand gradient. */
export const runtime = "nodejs";
export const alt = "ملف مستقل على شغل أونلاين";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { id: string } }) {
  const f = await serverApi<{ name: string; bio_title?: string }>(`/freelancers/${encodeSegment(params.id)}`, 300);
  return brandOgImage({
    eyebrow: f?.bio_title || "مستقل",
    title: f?.name || "ملف مستقل على شغل أونلاين",
  });
}

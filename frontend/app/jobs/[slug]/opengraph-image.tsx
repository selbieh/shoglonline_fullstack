import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";
import { serverApi, encodeSegment } from "@/lib/seo";

/* Per-job social card: the job title over the brand gradient. */
export const runtime = "nodejs";
export const alt = "وظيفة على شغل أونلاين";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { slug: string } }) {
  const job = await serverApi<{ title: string }>(`/jobs/${encodeSegment(params.slug)}`, 300);
  return brandOgImage({ eyebrow: "وظيفة", title: job?.title || "وظيفة على شغل أونلاين" });
}

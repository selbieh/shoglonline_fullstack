import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";
import { serverApi, encodeSegment } from "@/lib/seo";

/* Per-service social card: the service title over the brand gradient. */
export const runtime = "nodejs";
export const alt = "خدمة على شغل أونلاين";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { slug: string } }) {
  const s = await serverApi<{ title: string }>(`/services/${encodeSegment(params.slug)}`, 300);
  return brandOgImage({ eyebrow: "خدمة", title: s?.title || "خدمة على شغل أونلاين" });
}

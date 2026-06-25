import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

/* Default social card for the whole site (home + any page without its own opengraph-image). */
export const runtime = "nodejs";
export const alt = "شغل أونلاين — منصة الوظائف والخدمات الحرة";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return brandOgImage({
    eyebrow: "منصة عربية",
    title: "وظّف أفضل المستقلين أو ابدأ عملك التالي — بثقة",
  });
}

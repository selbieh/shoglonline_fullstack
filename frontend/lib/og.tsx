/* Branded Open Graph image generator (next/og). Produces a 1200×630 RTL social card with the
   brand gradient, an Arabic title and an eyebrow chip. The Arabic font is fetched once from Google
   Fonts (TTF via a legacy UA) and cached; if the fetch fails the card still renders (Latin
   fallback) so the route never hard-fails a social crawl. */
import { ImageResponse } from "next/og";
import { ORG_NAME, SITE_URL } from "@/lib/seo";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const BRAND = "#1B3DBC";
const BRAND_DEEP = "#0F2475";

let _fontCache: ArrayBuffer | null = null;

/** Fetch Tajawal as TTF (Satori can't read woff2). The legacy User-Agent makes Google Fonts serve
    a truetype `src`. Cached in module scope for the lifetime of the server instance. */
async function loadArabicFont(): Promise<ArrayBuffer | null> {
  if (_fontCache) return _fontCache;
  try {
    const css = await fetch("https://fonts.googleapis.com/css2?family=Tajawal:wght@800", {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3)" },
    }).then((r) => r.text());
    const url =
      css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?truetype/)?.[1] ??
      css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!url) return null;
    _fontCache = await fetch(url).then((r) => r.arrayBuffer());
    return _fontCache;
  } catch {
    return null;
  }
}

const host = SITE_URL.replace(/^https?:\/\//, "");

export async function brandOgImage({
  title,
  eyebrow,
}: {
  title: string;
  eyebrow?: string;
}): Promise<ImageResponse> {
  const font = await loadArabicFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DEEP} 100%)`,
          color: "white",
          fontFamily: "Tajawal, sans-serif",
          direction: "rtl",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>{ORG_NAME}</div>
          {eyebrow ? (
            <div
              style={{
                display: "flex",
                fontSize: 26,
                padding: "10px 26px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.16)",
              }}
            >
              {eyebrow}
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.25,
            maxWidth: 1040,
          }}
        >
          {title.length > 90 ? `${title.slice(0, 90)}…` : title}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28 }}>
          <div style={{ display: "flex", opacity: 0.92 }}>وظائف · خدمات · مستقلون · مدفوعات بالضمان</div>
          <div style={{ display: "flex", fontWeight: 700 }} dir="ltr">{host}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: font ? [{ name: "Tajawal", data: font, weight: 800 as const, style: "normal" as const }] : [],
    },
  );
}

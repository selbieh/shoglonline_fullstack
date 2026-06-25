import type { MetadataRoute } from "next";

/* PWA / install manifest. Next serves this at /manifest.webmanifest and auto-links it. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "شغل أونلاين — وظائف وخدمات حرة",
    short_name: "شغل أونلاين",
    description:
      "منصة عربية تربط أصحاب الأعمال بالمستقلين — وظائف، خدمات مميزة، ومدفوعات آمنة بنظام الضمان",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1B3DBC",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "productivity"],
    icons: [
      { src: "/logo-mark.png", sizes: "any", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "any", type: "image/png", purpose: "maskable" },
    ],
  };
}

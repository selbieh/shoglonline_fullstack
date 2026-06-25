import type { Metadata } from "next";

// Default metadata for the /gallery segment (the gallery page itself is a client component).
export const metadata: Metadata = {
  title: "معرض الأعمال",
  description:
    "استعرض أعمال المستقلين العرب — تصاميم، مشاريع برمجية، محتوى، وأعمال إبداعية مميزة. اكتشف الموهبة المناسبة لمشروعك.",
  alternates: { canonical: "/gallery" },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return children;
}

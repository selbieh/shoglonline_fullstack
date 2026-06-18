import type { Metadata } from "next";

// Default metadata for the /services segment. /services/[slug] overrides via generateMetadata.
export const metadata: Metadata = {
  title: "الخدمات الخاصة",
  description: "خدمات جاهزة بسعر ثابت من مستقلين عرب — تصفّح، قارن، واطلب مباشرة بمدفوعات بنظام الضمان.",
  alternates: { canonical: "/services" },
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}

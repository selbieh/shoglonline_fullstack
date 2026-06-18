import type { Metadata } from "next";

// Default metadata for the /jobs segment. /jobs/[slug] overrides via generateMetadata.
export const metadata: Metadata = {
  title: "الوظائف",
  description: "تصفّح أحدث الوظائف الحرة عن بُعد في البرمجة والتصميم والكتابة والتسويق — قدّم عرضك بثقة.",
  alternates: { canonical: "/jobs" },
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

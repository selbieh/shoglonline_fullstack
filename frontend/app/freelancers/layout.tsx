import type { Metadata } from "next";

// Default metadata for the /freelancers segment. /freelancers/[id] overrides via generateMetadata.
export const metadata: Metadata = {
  title: "المستقلون",
  description: "تصفّح أفضل المستقلين العرب — حسب التخصص والتقييم والسعر، وتواصل معهم مباشرة على المنصّة.",
  alternates: { canonical: "/freelancers" },
};

export default function FreelancersLayout({ children }: { children: React.ReactNode }) {
  return children;
}

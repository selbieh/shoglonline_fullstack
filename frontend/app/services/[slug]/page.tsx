import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment, serviceLd, breadcrumbLd, serviceMetaDescription } from "@/lib/seo";
import ReportButton from "@/components/ReportButton";
import ServiceDetailView, { type ServiceDetail } from "@/components/ServiceDetailView";
import BuyBox from "./BuyBox";

/* Server-rendered service detail (SEO): content + metadata + Product/Offer JSON-LD.
   The visible layout lives in <ServiceDetailView> (shared with the owner's preview);
   favourite + buy box is a client island. */

type Service = ServiceDetail;

async function getService(slug: string): Promise<Service | null> {
  return serverApi<Service>(`/services/${encodeSegment(slug)}`, 60);
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const s = await getService(params.slug);
  if (!s) return { title: "خدمة غير موجودة" };
  // editor SEO overrides win; otherwise fall back to the title / a description excerpt
  const title = s.meta_title || s.title;
  const description = s.meta_description || serviceMetaDescription(s);
  return {
    title,
    description,
    alternates: { canonical: `/services/${s.slug}` },
    openGraph: { type: "article", title, description, url: `${SITE_URL}/services/${s.slug}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ServiceDetailPage({ params }: { params: { slug: string } }) {
  const s = await getService(params.slug);
  if (!s) notFound();

  const jsonLd = [
    serviceLd(s),
    breadcrumbLd([
      { name: "الرئيسية", path: "/" },
      { name: "الخدمات", path: "/services" },
      { name: s.title, path: `/services/${s.slug}` },
    ]),
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <ServiceDetailView
        s={s}
        titleActions={<ReportButton kind="service" id={s.id} label="إبلاغ" />}
        buyBox={<BuyBox service={{ id: s.id, base_price: s.base_price, addons: s.addons, worker: s.worker }} />}
      />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment, personLd, breadcrumbLd, freelancerMetaDescription } from "@/lib/seo";
import { type FreelancerDetail } from "@/lib/types";
import { type ServiceCardData } from "@/components/ServiceCard";
import FreelancerProfileView from "@/components/FreelancerProfileView";
import ProfileActions from "./ProfileActions";

/* Server-rendered public freelancer profile (SEO). The visual layout lives in the shared
   <FreelancerProfileView> so the owner's preview (/me/profile/preview) renders identically.
   Read-only; the owner edits via /me/profile. No external contact is shown (ppt slide-01). */

async function getFreelancer(id: string): Promise<FreelancerDetail | null> {
  return serverApi<FreelancerDetail>(`/freelancers/${encodeSegment(id)}`, 60);
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const f = await getFreelancer(params.id);
  if (!f) return { title: "مستقل غير موجود" };
  const description = freelancerMetaDescription({
    name: f.name,
    bio_title: f.bio_title,
    overview: f.overview,
    skills: f.skills?.map((s) => s.name),
    city: f.city,
    country: f.country,
    rating_avg: f.rating_avg,
    rating_count: f.rating_count,
  });
  return {
    title: f.name,
    description,
    alternates: { canonical: `/freelancers/${f.id}` },
    openGraph: { type: "profile", title: f.name, description, url: `${SITE_URL}/freelancers/${f.id}` },
    twitter: { card: "summary_large_image", title: f.name, description },
  };
}

export default async function FreelancerDetailPage({ params }: { params: { id: string } }) {
  const f = await getFreelancer(params.id);
  if (!f) notFound();

  const servicesResp = await serverApi<{ results: ServiceCardData[] }>(`/services?worker=${f.id}`, 60);
  const services = servicesResp?.results ?? [];

  return (
    <>
      <JsonLd data={[
        personLd(f),
        breadcrumbLd([
          { name: "الرئيسية", path: "/" },
          { name: "المستقلون", path: "/freelancers" },
          { name: f.name, path: `/freelancers/${f.id}` },
        ]),
      ]} />
      <FreelancerProfileView
        f={f}
        services={services}
        headerSlot={<a href="/freelancers" className="text-sm font-medium text-primary-dark hover:underline">→ كل المستقلين</a>}
        actions={<ProfileActions profileId={f.id} />}
      />
    </>
  );
}

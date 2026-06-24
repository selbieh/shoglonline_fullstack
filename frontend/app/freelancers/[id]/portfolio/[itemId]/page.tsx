import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverApi, encodeSegment } from "@/lib/seo";
import MediaGallery from "@/components/MediaGallery";
import { DetailRail, RailRow } from "@/components/DetailRail";
import OwnerCard from "@/components/OwnerCard";
import SimilarWorks, { type SimilarWork } from "@/components/SimilarWorks";
import FeatureChecklist from "@/components/FeatureChecklist";
import ReportButton from "@/components/ReportButton";
import { BarChartIcon, BriefcaseIcon, ClockIcon, CodeIcon, ExternalLinkIcon, WalletIcon } from "@/components/icons";

/* Public single portfolio work — work-showcase (معرض عمل فردي، رؤية الغير — ppt slide-22). SSR for
   SEO. Hero/thumbnail gallery + structured detail rail + owner card + «أعمال مشابهة» from the same
   freelancer. Honest data only: budget / view-counters / feature bullets are not stored, so omitted. */

type Item = {
  id: number; title: string; description: string; media_type: string;
  url: string; cover_url: string; image_url: string; gallery?: string[];
  project_type?: string; project_link?: string;
  duration_value?: number | null; duration_unit?: string;
  skills?: string[]; completed_at?: string | null; created_at?: string;
  budget?: string | null; features?: string[]; views_count?: number;
};
type PortfolioCard = { id: number; title: string; image_url?: string; cover_url?: string };
type Worker = {
  id: number; name: string; avatar_url?: string; is_verified?: boolean;
  rating_avg?: number | string; rating_count?: number; city?: string; country?: string;
  portfolio?: PortfolioCard[];
};

const UNIT: Record<string, string> = { day: "يوم", month: "شهر" };

async function getItem(itemId: string): Promise<Item | null> {
  return serverApi<Item>(`/freelancers/portfolio/${encodeSegment(itemId)}`, 60);
}
async function getWorker(id: string): Promise<Worker | null> {
  return serverApi<Worker>(`/freelancers/${encodeSegment(id)}`, 60);
}

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: { params: { itemId: string } }): Promise<Metadata> {
  const it = await getItem(params.itemId);
  return it ? { title: it.title, description: (it.description || it.title).slice(0, 160) } : { title: "عمل غير موجود" };
}

export default async function PortfolioItemPage({ params }: { params: { id: string; itemId: string } }) {
  const [it, worker] = await Promise.all([getItem(params.itemId), getWorker(params.id)]);
  if (!it) notFound();

  const images = it.gallery && it.gallery.length > 0 ? it.gallery : [it.image_url || it.cover_url || it.url].filter(Boolean);
  const skills = it.skills ?? [];
  const ratingAvg = worker?.rating_avg != null ? Number(worker.rating_avg) : 0;
  const location = [worker?.city, worker?.country].filter(Boolean).join("، ");

  const similar: SimilarWork[] = (worker?.portfolio ?? [])
    .filter((p) => p.id !== it.id)
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      title: p.title,
      thumb: p.image_url || p.cover_url,
      author: worker?.name,
      rating: ratingAvg,
      href: `/freelancers/${params.id}/portfolio/${p.id}`,
    }));

  return (
    <main className="bg-bg">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-sub" aria-label="مسار التنقل">
          <a href="/" className="hover:text-primary-dark">الرئيسية</a>
          <span aria-hidden>/</span>
          <a href={`/freelancers/${params.id}`} className="hover:text-primary-dark">{worker?.name || "المستقل"}</a>
          <span aria-hidden>/</span>
          <span className="truncate font-medium text-ink">{it.title}</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-extrabold md:text-3xl">{it.title}</h1>
          <ReportButton kind="portfolio" id={it.id} label="الإبلاغ عن مخالفة" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* main column */}
          <div className="min-w-0 space-y-6">
            <MediaGallery images={images} alt={it.title} />

            {it.description && (
              <section className="card">
                <h2 className="mb-3 font-bold text-ink">عن المشروع</h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-ink/80">{it.description}</p>
              </section>
            )}

            {it.features && it.features.length > 0 && (
              <section className="card">
                <h2 className="mb-3 font-bold text-ink">مميزات المشروع</h2>
                <FeatureChecklist items={it.features} />
              </section>
            )}

            {skills.length > 0 && (
              <section className="card">
                <h2 className="mb-3 font-bold text-ink">التقنيات المستخدمة</h2>
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span key={s} className="rounded-full bg-tint px-3 py-1.5 text-sm font-medium text-primary-dark">{s}</span>
                  ))}
                </div>
              </section>
            )}

            {similar.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-bold text-ink">أعمال مشابهة</h2>
                  <a href={`/freelancers/${params.id}`} className="text-xs font-medium text-primary-dark hover:underline">عرض المزيد من الأعمال ←</a>
                </div>
                <SimilarWorks items={similar} />
              </section>
            )}
          </div>

          {/* right rail */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <DetailRail title="بيانات العمل">
              {it.project_type && <RailRow icon={<BriefcaseIcon />} label="نوع المشروع" value={it.project_type} />}
              {it.created_at && <RailRow icon={<ClockIcon />} label="تاريخ نشر العمل" value={fmtDate(it.created_at)} />}
              {it.completed_at && <RailRow icon={<ClockIcon />} label="تاريخ الإنجاز" value={fmtDate(it.completed_at)} />}
              {it.duration_value != null && (
                <RailRow icon={<ClockIcon />} label="مدة التنفيذ"
                  value={`${it.duration_value.toLocaleString("ar-EG")} ${UNIT[it.duration_unit ?? ""] ?? ""}`} />
              )}
              {it.budget && <RailRow icon={<WalletIcon />} label="الميزانية" value={<span dir="ltr">${it.budget}</span>} />}
              {skills.length > 0 && <RailRow icon={<CodeIcon />} label="الأدوات المستخدمة" value={skills.join("، ")} />}
              {it.project_link && (
                <RailRow icon={<ExternalLinkIcon />} label="رابط المشروع"
                  value={<a href={it.project_link} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-primary-dark hover:underline">{it.project_link}</a>} />
              )}
            </DetailRail>

            {worker && (
              <OwnerCard
                title="صاحب العمل"
                name={worker.name}
                avatarUrl={worker.avatar_url}
                verified={worker.is_verified}
                location={location}
                rating={ratingAvg}
                ratingCount={worker.rating_count}
                profileHref={`/freelancers/${params.id}`}
                profileLabel="عرض ملف صاحب العمل"
              />
            )}

            {it.views_count != null && (
              <DetailRail title="إحصائيات العمل">
                <RailRow icon={<BarChartIcon />} label="مشاهدات العمل" value={it.views_count.toLocaleString("ar-EG")} />
              </DetailRail>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

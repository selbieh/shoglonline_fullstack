import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment, personLd } from "@/lib/seo";
import { EXPERTISE_LABEL, type FreelancerDetail } from "@/lib/types";

/* Server-rendered freelancer profile (SEO): content + metadata + Person JSON-LD. */

async function getFreelancer(id: string): Promise<FreelancerDetail | null> {
  return serverApi<FreelancerDetail>(`/freelancers/${encodeSegment(id)}`, 60);
}

export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  const f = await getFreelancer(params.id);
  if (!f) return { title: "مستقل غير موجود" };
  const description = (f.bio_title || f.overview || `الملف الشخصي لـ ${f.name}`).slice(0, 160);
  return {
    title: f.name,
    description,
    alternates: { canonical: `/freelancers/${f.id}` },
    openGraph: { type: "profile", title: f.name, description, url: `${SITE_URL}/freelancers/${f.id}` },
    twitter: { card: "summary", title: f.name, description },
  };
}

export default async function FreelancerDetailPage({ params }: { params: { id: string } }) {
  const f = await getFreelancer(params.id);
  if (!f) notFound();

  const jsonLd = personLd(f);
  const rated = Number(f.rating_count) > 0;

  return (
    <main>
      <JsonLd data={jsonLd} />
      {/* gradient hero band */}
      <section className="bg-hero text-white">
        <div className="mx-auto max-w-3xl px-6 pb-10 pt-8">
          <a href="/freelancers" className="text-sm text-tint hover:underline">← كل المستقلين</a>
          <div className="mt-4 flex items-center gap-4">
            {f.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.avatar_url}
                alt={f.name}
                className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white/40"
              />
            ) : (
              <span className="glass grid h-16 w-16 shrink-0 place-content-center rounded-full text-2xl font-extrabold">
                {f.name.charAt(0)}
              </span>
            )}
            <div>
              <h1 className="text-3xl font-extrabold drop-shadow-sm">{f.name}</h1>
              {f.bio_title && <p className="mt-1 text-tint">{f.bio_title}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {f.expertise_level && <span className="glass px-3 py-1">{EXPERTISE_LABEL[f.expertise_level]}</span>}
            {rated && <span className="glass px-3 py-1">★ {Number(f.rating_avg).toFixed(1)} ({f.rating_count})</span>}
            {f.hourly_rate && (
              <span className="glass px-3 py-1"><span dir="ltr">{f.hourly_rate}</span> د.ك/ساعة</span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-6 max-w-3xl space-y-4 px-6 pb-12">
        {f.overview && (
          <section className="card">
            <h2 className="mb-3 font-bold gradient-text">نبذة</h2>
            <p className="whitespace-pre-wrap text-sm leading-7 text-primary-deep">{f.overview}</p>
          </section>
        )}

        {f.skills.length > 0 && (
          <section className="card">
            <h2 className="mb-3 font-bold gradient-text">المهارات</h2>
            <div className="flex flex-wrap gap-2">
              {f.skills.map((s) => (
                <span key={s.skill_id} className="chip bg-tint text-primary-dark">{s.name}</span>
              ))}
            </div>
          </section>
        )}

        {f.languages.length > 0 && (
          <section className="card">
            <h2 className="mb-3 font-bold gradient-text">اللغات</h2>
            <ul className="flex flex-wrap gap-2 text-sm text-sub">
              {f.languages.map((l, i) => (
                <li key={i} className="chip">{l.name} · {l.proficiency}</li>
              ))}
            </ul>
          </section>
        )}

        {f.employments.length > 0 && (
          <section className="card">
            <h2 className="mb-3 font-bold gradient-text">الخبرات العملية</h2>
            <ul className="space-y-4">
              {f.employments.map((e, i) => (
                <li key={i} className="border-r-2 border-line pe-0 ps-4">
                  <p className="font-bold">{e.job_title}</p>
                  <p className="text-sm text-sub">
                    {e.company}
                    {(e.period_from || e.period_to) && ` · ${e.period_from} – ${e.period_to || "الآن"}`}
                  </p>
                  {e.description && <p className="mt-1 text-sm leading-6 text-primary-deep">{e.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {f.educations.length > 0 && (
          <section className="card">
            <h2 className="mb-3 font-bold gradient-text">التعليم</h2>
            <ul className="space-y-4">
              {f.educations.map((ed, i) => (
                <li key={i} className="border-r-2 border-line pe-0 ps-4">
                  <p className="font-bold">{ed.school}</p>
                  <p className="text-sm text-sub">
                    {[ed.degree, ed.area_of_study].filter(Boolean).join(" · ")}
                    {(ed.date_from || ed.date_to) && ` · ${ed.date_from} – ${ed.date_to || ""}`}
                  </p>
                  {ed.description && <p className="mt-1 text-sm leading-6 text-primary-deep">{ed.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverApi, encodeSegment } from "@/lib/seo";

/* Server-rendered CMS page (SEO): about / terms / privacy, etc. */

type Page = { slug: string; title: string; body: string; updated_at: string };

async function getPage(slug: string): Promise<Page | null> {
  return serverApi<Page>(`/pages/${encodeSegment(slug)}`, 300);
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const page = await getPage(params.slug);
  if (!page) return { title: "صفحة غير موجودة" };
  return {
    title: page.title,
    description: (page.body || "").slice(0, 160),
    alternates: { canonical: `/pages/${page.slug}` },
  };
}

export default async function ContentPageView({ params }: { params: { slug: string } }) {
  const page = await getPage(params.slug);
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-extrabold">{page.title}</h1>
      <article className="mt-4 whitespace-pre-wrap leading-relaxed text-primary-deep">{page.body}</article>
    </main>
  );
}

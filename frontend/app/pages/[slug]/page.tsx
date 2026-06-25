import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, SITE_URL, serverApi, encodeSegment, articleLd, breadcrumbLd, pageMetaDescription } from "@/lib/seo";

/* Server-rendered CMS page (SEO): about / terms / privacy, etc. */

type Page = { slug: string; title: string; body: string; updated_at: string; meta_title?: string; meta_description?: string };

async function getPage(slug: string): Promise<Page | null> {
  return serverApi<Page>(`/pages/${encodeSegment(slug)}`, 300);
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const page = await getPage(params.slug);
  if (!page) return { title: "صفحة غير موجودة" };
  // editor SEO overrides win; otherwise fall back to the title / a body excerpt
  const title = page.meta_title || page.title;
  const description = page.meta_description || pageMetaDescription(page);
  return {
    title,
    description,
    alternates: { canonical: `/pages/${page.slug}` },
    openGraph: { type: "article", title, description, url: `${SITE_URL}/pages/${page.slug}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ContentPageView({ params }: { params: { slug: string } }) {
  const page = await getPage(params.slug);
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <JsonLd data={[
        articleLd(page),
        breadcrumbLd([
          { name: "الرئيسية", path: "/" },
          { name: page.title, path: `/pages/${page.slug}` },
        ]),
      ]} />
      <h1 className="text-3xl font-extrabold">{page.title}</h1>
      <article className="mt-4 whitespace-pre-wrap leading-relaxed text-primary-deep">{page.body}</article>
    </main>
  );
}

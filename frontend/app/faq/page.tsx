import type { Metadata } from "next";
import { JsonLd, serverApi } from "@/lib/seo";

/* Server-rendered FAQ (SEO): content + FAQPage structured data. Native <details>
   accordion needs no client JS. */

type FAQ = { id: number; question: string; answer: string; category: string };

export const metadata: Metadata = {
  title: "الأسئلة الشائعة",
  description: "إجابات عن أكثر الأسئلة شيوعًا حول شغل أونلاين — الحساب، المدفوعات، العقود والضمان.",
  alternates: { canonical: "/faq" },
};

export default async function FAQPage() {
  const data = await serverApi<{ results: FAQ[] }>("/faqs");
  const faqs = data?.results ?? [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      {faqs.length > 0 && <JsonLd data={jsonLd} />}
      <h1 className="text-3xl font-extrabold">الأسئلة الشائعة</h1>

      {faqs.length === 0 ? (
        <div className="mt-10 rounded-m bg-tint p-8 text-center text-sub">لا أسئلة بعد</div>
      ) : (
        <ul className="mt-6 space-y-2">
          {faqs.map((f) => (
            <li key={f.id} className="card">
              <details>
                <summary className="cursor-pointer font-bold">{f.question}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-primary-deep">{f.answer}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL, tokens } from "@/lib/api";
import type { Category } from "@/lib/types";
import { InfoIcon } from "@/components/icons";

/** Post a job (FR-JOB-1/2) — moderation flag may queue it for admin review. */
export default function NewJobPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    budget_min: "",
    budget_max: "",
    location_type: "remote",
    city: "",
  });
  const [questions, setQuestions] = useState<{ question: string; is_required: boolean }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tokens.access) router.replace("/signin");
    fetch(`${API_URL}/categories`).then(async (r) => setCategories(await r.json()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm({ ...form, [key]: value });
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const job = await api<{ status: string; slug: string }>("/me/jobs", {
        method: "POST",
        body: JSON.stringify({ ...form, screening_questions: questions }),
      });
      if (job.status === "pending_review") {
        setMsg("⏳ أُرسلت وظيفتك لمراجعة الإدارة — ستُنشر فور الموافقة ويصل بريد للمشتركين في الفئة");
      } else {
        router.push(`/jobs/${job.slug}`);
      }
    } catch {
      setMsg("⚠️ تحقق من الحقول الإلزامية — الميزانية الدنيا يجب ألا تتجاوز العليا");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-m border border-line-strong px-3 py-2";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-extrabold">نشر وظيفة جديدة</h1>
      <div className="card mt-6 space-y-4">
        <label className="block text-sm font-bold">
          عنوان الوظيفة *
          <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} />
          <span className="text-xs font-normal text-sub">يُقفل التعديل عليه بعد استلام أول عرض</span>
        </label>
        <label className="block text-sm font-bold">
          الفئة *
          <select className={input} value={form.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">اختر…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name_ar}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold">
          وصف الوظيفة *
          <textarea className={`${input} min-h-32`} value={form.description}
            onChange={(e) => set("description", e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm font-bold">الميزانية من *
            <input className={input} value={form.budget_min} onChange={(e) => set("budget_min", e.target.value)} />
          </label>
          <label className="text-sm font-bold">إلى *
            <input className={input} value={form.budget_max} onChange={(e) => set("budget_max", e.target.value)} />
          </label>
          <label className="text-sm font-bold">نوع الموقع
            <select className={input} value={form.location_type} onChange={(e) => set("location_type", e.target.value)}>
              <option value="remote">عن بُعد</option>
              <option value="onsite">حضوري</option>
              <option value="hybrid">هجين</option>
            </select>
          </label>
          <label className="text-sm font-bold">المدينة
            <input className={input} value={form.city} onChange={(e) => set("city", e.target.value)} />
          </label>
        </div>

        <div className="rounded-m bg-bg p-3">
          <p className="text-sm font-bold">أسئلة فرز للمتقدمين</p>
          {questions.map((q, i) => (
            <div key={i} className="mt-2 flex items-center gap-2">
              <input className="flex-1 rounded-s border border-line px-3 py-1.5 text-sm" value={q.question}
                onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={q.is_required}
                  onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, is_required: e.target.checked } : x)))} />
                إلزامي
              </label>
              <button className="text-danger" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="mt-2 text-sm text-primary-dark"
            onClick={() => setQuestions([...questions, { question: "", is_required: true }])}>
            + أضف سؤالًا
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-m bg-warn-t p-3 text-sm text-warn">
          <InfoIcon className="mt-0.5 shrink-0 text-[16px]" />
          <span>قد تخضع الوظيفة لمراجعة الإدارة قبل النشر. عند النشر يصل بريد فوري للمشتركين في الفئة،
          وتُغلق تلقائيًا بعد ٣٠ يومًا إن لم تُرسَّ.</span>
        </div>

        <button className="btn-primary w-full py-3" disabled={busy} onClick={submit}>
          {busy ? "جارٍ النشر…" : "تأكيد الفئة ونشر الوظيفة"}
        </button>
        {msg && <p className="rounded-m bg-tint p-3 text-sm text-primary-dark">{msg}</p>}
      </div>
    </main>
  );
}

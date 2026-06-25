"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, API_URL, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import type { Category, Skill } from "@/lib/types";
import ContactHint from "@/components/ContactHint";
import { InfoIcon, CheckIcon } from "@/components/icons";

/** Arabic labels for backend field errors, so we can show the real reason instead of a blanket message. */
const FIELD_LABELS: Record<string, string> = {
  title: "عنوان الوظيفة",
  description: "وصف الوظيفة",
  category: "الفئة",
  budget_min: "الميزانية الدنيا",
  budget_max: "الميزانية العليا",
  expected_days: "مدة التنفيذ المتوقعة",
  screening_questions: "أسئلة الفرز",
};

/** Flatten a DRF error body ({field: [msg], non_field_errors: [...]}) into a single readable Arabic line. */
function describeError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const parts: string[] = [];
  for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
    const label = FIELD_LABELS[key];
    const msg = Array.isArray(val) ? val.join("، ") : typeof val === "string" ? val : null;
    if (!msg) continue;
    parts.push(label ? `${label}: ${msg}` : msg);
  }
  return parts.length ? parts.join(" — ") : null;
}

/** Post a job (FR-JOB-1/2) — moderation flag may queue it for admin review. Remote-only platform. */
export default function NewJobPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillIds, setSkillIds] = useState<number[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    budget_min: "",
    budget_max: "",
    expected_days: "",
  });
  const [questions, setQuestions] = useState<{ question: string; is_required: boolean }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // When set, the form is replaced by a thank-you screen. `pending` distinguishes "queued for review" from "published".
  const [done, setDone] = useState<{ slug: string; pending: boolean } | null>(null);

  useEffect(() => {
    if (!tokens.access) router.replace(signinHereHref());
    fetch(`${API_URL}/categories`).then(async (r) => setCategories(await r.json()));
    fetch(`${API_URL}/skills`).then(async (r) => setSkills(await r.json()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm({ ...form, [key]: value });
  }

  // Skills hang off subcategories; show only those under the chosen top-level category.
  const selectedCat = categories.find((c) => String(c.id) === form.category);
  const subIds = new Set((selectedCat?.children ?? []).map((s) => s.id));
  const availableSkills = form.category ? skills.filter((s) => subIds.has(s.subcategory_id)) : [];

  function toggleSkill(id: number) {
    setSkillIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function pickCategory(value: string) {
    // dropping the category can orphan selected skills — clear any that no longer belong
    const cat = categories.find((c) => String(c.id) === value);
    const valid = new Set((cat?.children ?? []).map((s) => s.id));
    setSkillIds((ids) => ids.filter((id) => skills.some((s) => s.id === id && valid.has(s.subcategory_id))));
    set("category", value);
  }

  /** Client-side gate: name the exact required fields that are missing or invalid, before hitting the API. */
  function clientErrors(): string[] {
    const errs: string[] = [];
    if (!form.title.trim()) errs.push("عنوان الوظيفة");
    if (!form.category) errs.push("الفئة");
    if (!form.description.trim()) errs.push("وصف الوظيفة");
    if (!form.budget_min.trim()) errs.push("الميزانية الدنيا");
    if (!form.budget_max.trim()) errs.push("الميزانية العليا");
    const min = Number(form.budget_min), max = Number(form.budget_max);
    if (form.budget_min.trim() && Number.isNaN(min)) errs.push("الميزانية الدنيا يجب أن تكون رقمًا");
    if (form.budget_max.trim() && Number.isNaN(max)) errs.push("الميزانية العليا يجب أن تكون رقمًا");
    return errs;
  }

  async function submit() {
    const missing = clientErrors();
    if (missing.length) {
      setMsg(`⚠️ يرجى تعبئة/تصحيح الحقول الإلزامية: ${missing.join("، ")}`);
      return;
    }
    if (Number(form.budget_min) > Number(form.budget_max)) {
      setMsg("⚠️ الميزانية الدنيا يجب ألا تتجاوز العليا");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // Remote-only platform — location is fixed server-side via the model default.
      const payload: Record<string, unknown> = {
        ...form,
        location_type: "remote",
        skill_ids: skillIds,
        expected_days: form.expected_days.trim() ? Number(form.expected_days) : null,
        // drop empty screening rows so a blank question never blocks submission
        screening_questions: questions.filter((q) => q.question.trim()),
      };
      const job = await api<{ status: string; slug: string }>("/me/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setDone({ slug: job.slug, pending: job.status === "pending_review" });
    } catch (e: unknown) {
      const detail = describeError((e as { body?: unknown })?.body);
      setMsg(detail ? `⚠️ ${detail}` : "⚠️ تعذّر نشر الوظيفة — تحقّق من الحقول وحاول مجددًا");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full field";
  const optional = <span className="font-normal text-sub">(اختياري)</span>;

  // Success screen — replaces the form once the job is created.
  if (done) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="card flex flex-col items-center gap-5 py-12 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-t text-success">
            <CheckIcon className="text-[40px]" />
          </span>
          <h1 className="text-3xl font-extrabold">شكرًا لك! تم بنجاح 🎉</h1>
          <p className="max-w-md text-sub">
            {done.pending
              ? "أُرسلت وظيفتك لمراجعة الإدارة — ستُنشر فور الموافقة، ويصل بريد للمشتركين في الفئة."
              : "تم نشر وظيفتك بنجاح، وأصبحت ظاهرة للمستقلين. وسيصل بريد للمشتركين في الفئة."}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="btn-primary px-6 py-3">العودة إلى الرئيسية</Link>
            {!done.pending && (
              <Link href={`/jobs/${done.slug}`} className="btn-ghost px-6 py-3">عرض الوظيفة</Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-extrabold">نشر وظيفة جديدة</h1>
      <p className="mt-2 text-sm text-sub">
        الحقول المعلّمة بـ <span className="text-danger">*</span> إلزامية، والباقي اختياري.
      </p>
      <div className="card mt-6 space-y-4">
        <label className="block text-sm font-bold">
          عنوان الوظيفة <span className="text-danger">*</span>
          <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} />
          <span className="text-xs font-normal text-sub">يُقفل التعديل عليه بعد استلام أول عرض</span>
        </label>
        <label className="block text-sm font-bold">
          الفئة <span className="text-danger">*</span>
          <select className={input} value={form.category} onChange={(e) => pickCategory(e.target.value)}>
            <option value="">اختر…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name_ar}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold">
          وصف الوظيفة <span className="text-danger">*</span>
          <textarea className={`${input} min-h-32`} value={form.description}
            onChange={(e) => set("description", e.target.value)} />
          <ContactHint text={form.description} />
        </label>

        <div className="block text-sm font-bold">
          المهارات المطلوبة {optional}
          {!form.category ? (
            <p className="mt-1 text-xs font-normal text-sub">اختر الفئة أولًا لعرض المهارات المتاحة.</p>
          ) : availableSkills.length === 0 ? (
            <p className="mt-1 text-xs font-normal text-sub">لا توجد مهارات مرتبطة بهذه الفئة.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {availableSkills.map((s) => {
                const on = skillIds.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => toggleSkill(s.id)}
                    className={`chip font-normal transition ${on ? "bg-primary text-white" : "hover:bg-tint"}`}>
                    {on ? "✓ " : ""}{s.name_ar}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-sm font-bold">الميزانية من <span className="text-danger">*</span>
            <input className={input} inputMode="numeric" value={form.budget_min} onChange={(e) => set("budget_min", e.target.value)} />
            <span className="text-xs font-normal text-sub">بالدولار الأمريكي (USD)</span>
          </label>
          <label className="text-sm font-bold">إلى <span className="text-danger">*</span>
            <input className={input} inputMode="numeric" value={form.budget_max} onChange={(e) => set("budget_max", e.target.value)} />
            <span className="text-xs font-normal text-sub">بالدولار الأمريكي (USD)</span>
          </label>
          <label className="text-sm font-bold">مدة التنفيذ المتوقعة {optional}
            <div className="relative mt-1">
              <input className="w-full field pe-12" inputMode="numeric" value={form.expected_days}
                onChange={(e) => set("expected_days", e.target.value)} />
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-sub">يوم</span>
            </div>
            <span className="text-xs font-normal text-sub">المدة المتوقعة لإنجاز العمل بالأيام</span>
          </label>
        </div>

        <div className="flex items-center gap-2 rounded-m bg-bg p-3 text-sm text-sub">
          <InfoIcon className="shrink-0 text-[16px]" />
          <span>هذه المنصة تدعم العمل <span className="font-bold text-ink">عن بُعد فقط</span>.</span>
        </div>

        <div className="rounded-m bg-bg p-3">
          <p className="text-sm font-bold">أسئلة فرز للمتقدمين {optional}</p>
          {questions.map((q, i) => (
            <div key={i} className="mt-2 flex items-center gap-2">
              <input className="flex-1 field" value={q.question}
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

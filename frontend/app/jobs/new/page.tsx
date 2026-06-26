"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, API_URL, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { useFieldErrors, validateFields, type Rule } from "@/lib/useFieldErrors";
import type { Category, Skill } from "@/lib/types";
import Field from "@/components/Field";
import ContactHint from "@/components/ContactHint";
import { InfoIcon, CheckIcon, SearchIcon } from "@/components/icons";
import { normalizeArabic, digitsOnly } from "@/lib/arabic";

/** Post a job (FR-JOB-1/2) — moderation flag may queue it for admin review. Remote-only platform. */
export default function NewJobPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillIds, setSkillIds] = useState<number[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    budget_min: "",
    budget_max: "",
    expected_days: "",
  });
  const [questions, setQuestions] = useState<{ question: string; is_required: boolean }[]>([]);
  const { errors, setErrors, clearFields, formError, setFormError, applyApiError } = useFieldErrors();
  const [busy, setBusy] = useState(false);
  // When set, the form is replaced by a thank-you screen. `pending` distinguishes "queued for review" from "published".
  const [done, setDone] = useState<{ slug: string; pending: boolean } | null>(null);

  useEffect(() => {
    if (!tokens.access) router.replace(signinHereHref());
    // Guard against non-OK responses / error-object bodies: an array is required or .map/.filter throws at render.
    fetch(`${API_URL}/categories`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => setCategories([]));
    fetch(`${API_URL}/skills`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSkills(Array.isArray(d) ? d : []))
      .catch(() => setSkills([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Published (not queued for review) → show the success message briefly, then open the live job.
  useEffect(() => {
    if (done && !done.pending) {
      const t = setTimeout(() => router.push(`/jobs/${done.slug}`), 1600);
      return () => clearTimeout(t);
    }
  }, [done, router]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm({ ...form, [key]: value });
    clearFields(key);
  }

  // Skills hang off subcategories; show only those under the chosen top-level category.
  const selectedCat = categories.find((c) => String(c.id) === form.category);
  const subIds = new Set((selectedCat?.children ?? []).map((s) => s.id));
  const availableSkills = form.category ? skills.filter((s) => subIds.has(s.subcategory_id)) : [];
  // Filter the chip list as the user types; selected skills stay visible regardless.
  const nq = normalizeArabic(skillQuery);
  const shownSkills = nq
    ? availableSkills.filter((s) => skillIds.includes(s.id) || normalizeArabic(s.name_ar).includes(nq))
    : availableSkills;

  function toggleSkill(id: number) {
    setSkillIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function pickCategory(value: string) {
    // dropping the category can orphan selected skills — clear any that no longer belong
    const cat = categories.find((c) => String(c.id) === value);
    const valid = new Set((cat?.children ?? []).map((s) => s.id));
    setSkillIds((ids) => ids.filter((id) => skills.some((s) => s.id === id && valid.has(s.subcategory_id))));
    setSkillQuery("");
    set("category", value);
  }

  /** Client-side per-field rules, keyed by the same names the API reports (so messages line up). */
  const RULES: Record<string, Rule> = {
    title: () => (form.title.trim() ? "" : "أدخل عنوان الوظيفة"),
    category: () => (form.category ? "" : "اختر الفئة"),
    description: () => (form.description.trim() ? "" : "اكتب وصف الوظيفة"),
    budget_min: () => {
      if (!form.budget_min.trim()) return "أدخل الميزانية الدنيا";
      if (Number.isNaN(Number(form.budget_min))) return "أدخل رقمًا صحيحًا";
      return "";
    },
    budget_max: () => {
      if (!form.budget_max.trim()) return "أدخل الميزانية العليا";
      if (Number.isNaN(Number(form.budget_max))) return "أدخل رقمًا صحيحًا";
      if (form.budget_min.trim() && Number(form.budget_min) > Number(form.budget_max))
        return "العليا يجب ألا تقل عن الدنيا";
      return "";
    },
  };

  async function submit() {
    setFormError("");
    const found = validateFields(RULES, Object.keys(RULES));
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
      return;
    }
    setErrors({});
    setBusy(true);
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
      // Field-keyed errors (budget_min/max, deadline, title…) mark their inputs; the rest is a banner.
      const keys = applyApiError(e);
      if (keys.length) setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
    } finally {
      setBusy(false);
    }
  }

  const optional = <span className="font-normal text-sub">(اختياري)</span>;

  // Success screen — replaces the form once the job is created.
  if (done) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="card flex flex-col items-center gap-5 py-12 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-t text-success">
            <CheckIcon className="text-[40px]" />
          </span>
          <h1 className="text-3xl font-extrabold">
            {done.pending ? "تم الإرسال للمراجعة 📝" : "تم النشر بنجاح 🎉"}
          </h1>
          <p className="max-w-md text-sub">
            {done.pending
              ? "أُرسلت وظيفتك لمراجعة الإدارة — ستُنشر فور الموافقة، ويصل بريد للمشتركين في الفئة."
              : "تم نشر وظيفتك بنجاح، وأصبحت ظاهرة للمستقلين. جارٍ تحويلك إلى صفحة الوظيفة…"}
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
        <Field label="عنوان الوظيفة" required error={errors.title} hint="يُقفل التعديل عليه بعد استلام أول عرض">
          <input className="w-full field" value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="الفئة" required error={errors.category}>
          <select className="w-full field" value={form.category} onChange={(e) => pickCategory(e.target.value)}>
            <option value="">اختر…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name_ar}</option>
            ))}
          </select>
        </Field>
        <Field label="وصف الوظيفة" required error={errors.description}>
          <textarea className="w-full field min-h-32" value={form.description}
            onChange={(e) => set("description", e.target.value)} />
          <ContactHint text={form.description} mode="review" />
        </Field>

        <div className="block text-sm font-bold">
          المهارات المطلوبة {optional}
          {!form.category ? (
            <p className="mt-1 text-xs font-normal text-sub">اختر الفئة أولًا لعرض المهارات المتاحة.</p>
          ) : availableSkills.length === 0 ? (
            <p className="mt-1 text-xs font-normal text-sub">لا توجد مهارات مرتبطة بهذه الفئة.</p>
          ) : (
            <>
              {availableSkills.length > 8 && (
                <div className="relative mt-2">
                  <input value={skillQuery} onChange={(e) => setSkillQuery(e.target.value)}
                    placeholder="ابحث عن مهارة…"
                    className="w-full field pe-9 font-normal" />
                  <SearchIcon className="pointer-events-none absolute inset-y-0 end-3 my-auto text-[17px] text-sub" />
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {shownSkills.map((s) => {
                  const on = skillIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleSkill(s.id)}
                      className={`chip font-normal transition ${on ? "bg-primary text-white" : "hover:bg-tint"}`}>
                      {on ? "✓ " : ""}{s.name_ar}
                    </button>
                  );
                })}
                {shownSkills.length === 0 && (
                  <p className="text-xs font-normal text-sub">لا توجد مهارة مطابقة.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="الميزانية من" required error={errors.budget_min} hint="USD">
            <input className="w-full field" inputMode="numeric" value={form.budget_min}
              onChange={(e) => set("budget_min", digitsOnly(e.target.value))} />
          </Field>
          <Field label="إلى" required error={errors.budget_max} hint="USD">
            <input className="w-full field" inputMode="numeric" value={form.budget_max}
              onChange={(e) => set("budget_max", digitsOnly(e.target.value))} />
          </Field>
          <Field label="مدة التنفيذ المتوقعة" hint="بالأيام (اختياري)" error={errors.expected_days}>
            <div className="relative">
              <input className="w-full field pe-12" inputMode="numeric" value={form.expected_days}
                onChange={(e) => set("expected_days", digitsOnly(e.target.value))} />
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-sub">يوم</span>
            </div>
          </Field>
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
              <button type="button" aria-label="حذف السؤال" className="text-danger" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="mt-2 text-sm text-primary-dark"
            onClick={() => setQuestions([...questions, { question: "", is_required: true }])}>
            + أضف سؤالًا
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-m bg-warn-t p-3 text-sm text-warn">
          <InfoIcon className="mt-0.5 shrink-0 text-[16px]" />
          <span>قد تخضع الوظيفة لمراجعة الإدارة قبل النشر. عند النشر يصل بريد فوري للمشتركين في الفئة،
          وتُغلق تلقائيًا بعد 30 يومًا إن لم تُرسَّ.</span>
        </div>

        <button className="btn-primary w-full py-3" disabled={busy} onClick={submit}>
          {busy ? "جارٍ النشر…" : "تأكيد الفئة ونشر الوظيفة"}
        </button>
        {formError && <p className="rounded-m bg-danger-t p-3 text-sm text-danger">⚠️ {formError}</p>}
      </div>
    </main>
  );
}

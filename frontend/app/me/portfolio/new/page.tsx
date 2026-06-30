"use client";

import PageLoader from "@/components/PageLoader";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { useFieldErrors } from "@/lib/useFieldErrors";
import Field from "@/components/Field";
import FileUpload from "@/components/FileUpload";
import SkillMultiPicker from "@/components/SkillMultiPicker";
import { useSkillCatalog } from "@/lib/useSkillCatalog";
import { TrashIcon } from "@/components/icons";

/* Add a portfolio work (إضافة عمل جديد — ppt slide-23), on the enriched PortfolioItem
   (type/link/duration/skills/completion/ownership). Cover is a URL for now (upload = follow-up). */

export default function AddPortfolioPage() {
  const router = useRouter();
  const [f, setF] = useState({
    title: "", project_type: "", cover_url: "", description: "", project_link: "",
    duration_value: "", duration_unit: "month", completed_at: "",
    budget: "", features: "",
  });
  const [skills, setSkills] = useState<string[]>([]);
  const catalog = useSkillCatalog();
  const [ownership, setOwnership] = useState(false);
  const [coverAtt, setCoverAtt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const { errors, setErrors, clearFields, formError, setFormError, applyApiError } = useFieldErrors();

  useEffect(() => {
    // Gate the form on the auth check so it doesn't flash for one paint before redirecting.
    if (!tokens.access) router.replace(signinHereHref());
    else setReady(true);
  }, [router]);

  const set = (patch: Partial<typeof f>) => {
    setF((s) => ({ ...s, ...patch }));
    clearFields(...Object.keys(patch));
  };
  const features = f.features.split(/[\n]/).map((s) => s.trim()).filter(Boolean);

  async function submit() {
    setFormError("");
    const found: Record<string, string> = {};
    if (!f.title.trim()) found.title = "أدخل عنوان العمل";
    if (!ownership) found.ownership_confirmed = "يجب تأكيد ملكيتك للعمل قبل النشر";
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api("/me/portfolio", {
        method: "POST",
        body: JSON.stringify({
          title: f.title,
          description: f.description,
          media_type: f.cover_url ? "image" : f.project_link ? "link" : "image",
          url: f.cover_url || f.project_link,
          cover_url: f.cover_url,
          project_type: f.project_type,
          project_link: f.project_link,
          duration_value: f.duration_value ? Number(f.duration_value) : null,
          duration_unit: f.duration_value ? f.duration_unit : "",
          skills,
          completed_at: f.completed_at || null,
          budget: f.budget || null,
          features,
          ownership_confirmed: ownership,
          attachment_ids: coverAtt ? [coverAtt] : undefined,
        }),
      });
      router.push("/me/profile");
    } catch (e) {
      // field-keyed errors (title, description, url…) mark their inputs; the rest is a banner.
      const keys = applyApiError(e);
      if (keys.length) setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <PageLoader />;

  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">إضافة عمل جديد</h1>
        <a href="/me/profile" className="text-sm text-primary-dark">← ملفي</a>
      </div>
      <p className="mt-1 text-sm text-sub">اعرض أفضل أعمالك وشارك إنجازاتك مع العملاء.</p>

      <div className="mt-6 space-y-5">
        <Field label="عنوان العمل" required error={errors.title}>
          <input className="field" value={f.title} placeholder="اكتب عنوانًا واضحًا ومختصرًا للعمل"
            onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نوع المشروع">
            <input className="field" value={f.project_type} placeholder="مثال: تصميم واجهات مستخدم"
              onChange={(e) => set({ project_type: e.target.value })} />
          </Field>
          <Field label="رابط المشروع (اختياري)">
            <input className="field" dir="ltr" value={f.project_link} placeholder="https://…"
              onChange={(e) => set({ project_link: e.target.value })} />
          </Field>
        </div>
        <Field label="صورة العمل (الغلاف)">
          <FileUpload accept="image/*" multiple={false} label="ارفع صورة الغلاف"
            hint="يُفضَّل صورة أفقية بنسبة 16:9 (مثل 1280×720 بكسل) لتظهر البطاقة بشكل مثالي دون اقتطاع"
            onUploaded={(a) => { setCoverAtt(a.id); set({ cover_url: a.url }); }} />
          {f.cover_url && (
            <div className="relative mt-2 overflow-hidden rounded-m border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.cover_url} alt="معاينة صورة الغلاف"
                className="aspect-video w-full bg-tint object-cover" />
              <button type="button" onClick={() => { set({ cover_url: "" }); setCoverAtt(null); }}
                className="absolute end-2 top-2 grid h-8 w-8 place-content-center rounded-full bg-white/90 text-danger shadow transition hover:bg-white"
                aria-label="إزالة الصورة">
                <TrashIcon />
              </button>
              <span className="absolute bottom-2 start-2 rounded-full bg-success-t px-2 py-0.5 text-xs text-success">تم تعيين الصورة ✓</span>
            </div>
          )}
          <p className="mt-2 text-center text-xs text-sub">أو ألصق رابطًا</p>
          <input className="field mt-1" dir="ltr" value={f.cover_url} placeholder="https://… (رابط صورة)"
            onChange={(e) => { set({ cover_url: e.target.value }); setCoverAtt(null); }} />
        </Field>
        <Field label="وصف العمل" hint={`${f.description.length.toLocaleString("en-US")}/1000`}>
          <textarea className="field min-h-28" maxLength={1000} value={f.description}
            placeholder="اشرح أهداف المشروع، دورك فيه، التقنيات المستخدمة، والنتائج التي حققتها…"
            onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="مدة التنفيذ">
            <div className="flex gap-2">
              <input type="number" min={0} className="field" value={f.duration_value}
                placeholder="المدة" onChange={(e) => set({ duration_value: e.target.value })} />
              <select className="field w-28" value={f.duration_unit} onChange={(e) => set({ duration_unit: e.target.value })} aria-label="وحدة المدة">
                <option value="month">شهر</option>
                <option value="day">يوم</option>
              </select>
            </div>
          </Field>
          <Field label="تاريخ الإنجاز">
            <input type="date" className="field" value={f.completed_at}
              onChange={(e) => set({ completed_at: e.target.value })} />
          </Field>
        </div>
        <Field label="ميزانية المشروع (اختياري، بالدولار الأمريكي)">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-12 place-content-center rounded-m bg-tint text-sm font-bold text-primary-dark">USD</span>
            <input type="number" min={0} className="field" value={f.budget}
              placeholder="مثال: 1500" onChange={(e) => set({ budget: e.target.value })} />
          </div>
        </Field>
        <Field label="مميزات المشروع (اختياري)" hint="ميزة في كل سطر">
          <textarea className="field min-h-24" value={f.features}
            placeholder={"تصميم واجهة عصرية ومتجاوبة\nسرعة تحميل عالية\nتحسين محركات البحث (SEO)"}
            onChange={(e) => set({ features: e.target.value })} />
          {features.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {features.map((s, i) => <span key={`${s}-${i}`} className="tag-soft bg-tint text-primary-dark">{s}</span>)}
            </div>
          )}
        </Field>
        <Field label="المهارات المستخدمة" hint="اختر من قائمة المهارات">
          <SkillMultiPicker catalog={catalog} value={skills} onChange={setSkills} />
        </Field>

        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 accent-primary" checked={ownership}
              onChange={(e) => { setOwnership(e.target.checked); clearFields("ownership_confirmed"); }} />
            <span>أؤكد أن هذا العمل نفّذته بنفسي ولديّ الصلاحية الكاملة لنشره.</span>
          </label>
          {errors.ownership_confirmed && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger">{errors.ownership_confirmed}</p>
          )}
        </div>

        {formError && <p className="rounded-m bg-danger-t p-3 text-sm text-danger">{formError}</p>}

        <div className="flex gap-2">
          <button className="btn-primary disabled:opacity-50" disabled={busy} onClick={submit}>
            {busy ? "جارٍ الإضافة…" : "+ إضافة العمل"}
          </button>
          <a href="/me/profile" className="btn-secondary">إلغاء</a>
        </div>
      </div>
    </main>
  );
}

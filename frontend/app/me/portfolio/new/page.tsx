"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import FileUpload from "@/components/FileUpload";

/* Add a portfolio work (إضافة عمل جديد — ppt slide-23), on the enriched PortfolioItem
   (type/link/duration/skills/completion/ownership). Cover is a URL for now (upload = follow-up). */

export default function AddPortfolioPage() {
  const router = useRouter();
  const [f, setF] = useState({
    title: "", project_type: "", cover_url: "", description: "", project_link: "",
    skills: "", duration_value: "", duration_unit: "month", completed_at: "",
    budget: "", features: "",
  });
  const [ownership, setOwnership] = useState(false);
  const [coverAtt, setCoverAtt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!tokens.access) router.replace(signinHereHref());
  }, [router]);

  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  const skills = f.skills.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
  const features = f.features.split(/[\n]/).map((s) => s.trim()).filter(Boolean);

  async function submit() {
    if (!f.title) { setMsg("أدخل عنوان العمل"); return; }
    if (!ownership) { setMsg("يجب تأكيد ملكيتك للعمل قبل النشر"); return; }
    setBusy(true);
    setMsg("");
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
      setMsg(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">إضافة عمل جديد</h1>
        <a href="/me/profile" className="text-sm text-primary-dark">← ملفي</a>
      </div>
      <p className="mt-1 text-sm text-sub">اعرض أفضل أعمالك وشارك إنجازاتك مع العملاء.</p>

      <div className="mt-6 space-y-5">
        <Field label="عنوان العمل">
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
            onUploaded={(a) => { setCoverAtt(a.id); set({ cover_url: a.url }); }} />
          {coverAtt && <span className="mt-1 block text-xs text-success">تم رفع الصورة ✓</span>}
          <p className="mt-2 text-center text-xs text-sub">أو ألصق رابطًا</p>
          <input className="field mt-1" dir="ltr" value={f.cover_url} placeholder="https://… (رابط صورة)"
            onChange={(e) => { set({ cover_url: e.target.value }); setCoverAtt(null); }} />
        </Field>
        <Field label="وصف العمل" hint={`${f.description.length.toLocaleString("ar-EG")}/1000`}>
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
        <Field label="ميزانية المشروع (اختياري)">
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
              {features.map((s) => <span key={s} className="tag-soft bg-tint text-primary-dark">{s}</span>)}
            </div>
          )}
        </Field>
        <Field label="المهارات المستخدمة" hint="افصل بينها بفاصلة">
          <input className="field" value={f.skills} placeholder="Figma، React، Node.js"
            onChange={(e) => set({ skills: e.target.value })} />
          {skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {skills.map((s) => <span key={s} className="tag-soft bg-tint text-primary-dark">{s}</span>)}
            </div>
          )}
        </Field>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={ownership}
            onChange={(e) => setOwnership(e.target.checked)} />
          <span>أؤكد أن هذا العمل نفّذته بنفسي ولديّ الصلاحية الكاملة لنشره.</span>
        </label>

        {msg && <p className="rounded-m bg-danger-t p-3 text-sm text-danger">{msg}</p>}

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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-sub">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

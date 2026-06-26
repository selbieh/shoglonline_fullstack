"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import FileUpload from "@/components/FileUpload";

/* Manage / edit a portfolio work (ppt slide-24) — edit the project fields (PATCH), preview, or
   delete. Built on GET/PATCH/DELETE /me/portfolio/<id>. */

type Item = {
  id: number; title: string; description: string; project_type?: string; cover_url?: string;
  project_link?: string; duration_value?: number | null; duration_unit?: string;
  skills?: string[]; completed_at?: string | null; image_url?: string;
  budget?: string | number | null; features?: string[];
};

export default function PortfolioManagePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [f, setF] = useState({
    title: "", project_type: "", cover_url: "", description: "", project_link: "",
    skills: "", duration_value: "", duration_unit: "month", completed_at: "",
    budget: "", features: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [coverAtt, setCoverAtt] = useState<number | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [existingImage, setExistingImage] = useState("");

  const load = useCallback(async () => {
    const it = await api<Item>(`/me/portfolio/${params.id}`);
    setF({
      title: it.title ?? "",
      project_type: it.project_type ?? "",
      cover_url: it.cover_url ?? "",
      description: it.description ?? "",
      project_link: it.project_link ?? "",
      skills: (it.skills ?? []).join("، "),
      duration_value: it.duration_value != null ? String(it.duration_value) : "",
      duration_unit: it.duration_unit || "month",
      completed_at: it.completed_at ?? "",
      budget: it.budget != null ? String(it.budget) : "",
      features: (it.features ?? []).join("\n"),
    });
    setExistingImage(it.image_url ?? "");
    setLoaded(true);
  }, [params.id]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load().catch(() => router.replace(signinHereHref()));
  }, [load, router]);

  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  const skills = f.skills.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
  const features = f.features.split(/[\n]/).map((s) => s.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/me/portfolio/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: f.title,
          description: f.description,
          project_type: f.project_type,
          cover_url: f.cover_url,
          project_link: f.project_link,
          duration_value: f.duration_value ? Number(f.duration_value) : null,
          duration_unit: f.duration_value ? f.duration_unit : "",
          skills,
          completed_at: f.completed_at || null,
          budget: f.budget || null,
          features,
          attachment_ids: coverAtt ? [coverAtt] : undefined,
        }),
      });
      if (uploadedUrl) {
        setExistingImage(uploadedUrl);
        setUploadedUrl("");
        setCoverAtt(null);
      }
      setMsg({ ok: true, text: "✅ تم حفظ التعديلات" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("حذف هذا العمل نهائيًا؟")) return;
    await api(`/me/portfolio/${params.id}`, { method: "DELETE" }).catch(() => undefined);
    router.push("/me/profile");
  }

  if (!loaded) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">إدارة العمل</h1>
        <a href="/me/profile" className="text-sm text-primary-dark">← ملفي</a>
      </div>

      {msg && (
        <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>{msg.text}</p>
      )}

      <div className="mt-6 space-y-5">
        <Field label="عنوان العمل">
          <input className="field" value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نوع المشروع">
            <input className="field" value={f.project_type} onChange={(e) => set({ project_type: e.target.value })} />
          </Field>
          <Field label="رابط المشروع">
            <input className="field" dir="ltr" value={f.project_link} onChange={(e) => set({ project_link: e.target.value })} />
          </Field>
        </div>
        <Field label="صورة العمل (الغلاف)">
          {existingImage && !coverAtt && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={existingImage} alt="صورة الغلاف الحالية" className="mb-2 h-32 w-full rounded-m object-cover" />
          )}
          <FileUpload accept="image/*" multiple={false} label="ارفع صورة الغلاف"
            hint="يُفضَّل صورة أفقية بنسبة 16:9 (مثل 1280×720 بكسل) لتظهر البطاقة بشكل مثالي دون اقتطاع"
            onUploaded={(a) => { setCoverAtt(a.id); setUploadedUrl(a.url); }} />
          {coverAtt && <span className="mt-1 block text-xs text-success">تم رفع الصورة — احفظ التعديلات للتطبيق ✓</span>}
          <p className="mt-2 text-center text-xs text-sub">أو ألصق رابطًا</p>
          <input className="field mt-1" dir="ltr" value={f.cover_url} placeholder="https://… (رابط صورة)"
            onChange={(e) => { set({ cover_url: e.target.value }); setCoverAtt(null); setUploadedUrl(""); }} />
        </Field>
        <Field label="وصف العمل" hint={`${f.description.length.toLocaleString("en-US")}/1000`}>
          <textarea className="field min-h-28" maxLength={1000} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="مدة التنفيذ">
            <div className="flex gap-2">
              <input type="number" min={0} className="field" value={f.duration_value} onChange={(e) => set({ duration_value: e.target.value })} />
              <select className="field w-28" value={f.duration_unit} onChange={(e) => set({ duration_unit: e.target.value })} aria-label="وحدة المدة">
                <option value="month">شهر</option>
                <option value="day">يوم</option>
              </select>
            </div>
          </Field>
          <Field label="تاريخ الإنجاز">
            <input type="date" className="field" value={f.completed_at} onChange={(e) => set({ completed_at: e.target.value })} />
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
        <Field label="المهارات المستخدمة" hint="افصل بينها بفاصلة">
          <input className="field" value={f.skills} onChange={(e) => set({ skills: e.target.value })} />
          {skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {skills.map((s, i) => <span key={`${s}-${i}`} className="tag-soft bg-tint text-primary-dark">{s}</span>)}
            </div>
          )}
        </Field>

        <div className="flex flex-wrap gap-2 border-t border-line/70 pt-4">
          <button className="btn-primary disabled:opacity-50" disabled={busy} onClick={save}>
            {busy ? "جارٍ الحفظ…" : "حفظ التعديلات"}
          </button>
          <a href="/me/profile" className="btn-secondary">معاينة في ملفي</a>
          <button className="rounded-m px-4 py-2 text-sm text-danger transition hover:bg-danger-t" onClick={remove}>
            حذف العمل
          </button>
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

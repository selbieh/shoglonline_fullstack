"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens, type Me } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import FileUpload from "@/components/FileUpload";
import ContactHint from "@/components/ContactHint";
import type { PortfolioItem, PortfolioMediaType, WorkerEducation, WorkerEmployment, WorkerLanguage } from "@/lib/types";
import { ExternalLinkIcon, GridIcon, ImageIcon, PlayIcon, PlusIcon, TrashIcon } from "@/components/icons";

type Skill = { skill_id: number; name: string; efficiency: string };
type Certificate = {
  id?: number; name: string; issuer: string; issued_year: string | number | ""; verification_link: string;
};
type Profile = {
  display_name: string;
  bio_title: string;
  overview: string;
  intro_video: string;
  cover_image: string;
  expertise_level: string;
  main_category: number | null;
  specialization: number | null;
  years_experience: number | null;
  hourly_rate: string | null;
  availability: string;
  weekly_hours: number | null;
  client_notes: string;
  private_contact_channel: string;
  private_contact_value: string;
  is_verified: boolean;
  publish_state: "draft" | "pending_review" | "published" | "rejected";
  publish_reject_reason?: string;
  completeness_pct: number;
  skills: Skill[];
  educations: WorkerEducation[];
  employments: WorkerEmployment[];
  languages: WorkerLanguage[];
  certificates: Certificate[];
  portfolio: PortfolioItem[];
};
type CatalogSkill = { id: number; name_ar: string };
type CatalogCategory = { id: number; name_ar: string; children: CatalogCategory[] };
type Idv = { status: "none" | "pending" | "approved" | "rejected"; reject_reason?: string };

const LEVELS: Record<string, string> = { entry: "مبتدئ", intermediate: "متوسط", expert: "خبير" };
const EFF: Record<string, string> = { beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم", expert: "خبير" };
const PROF: Record<string, string> = { basic: "أساسي", advanced: "متقدم", native: "لغة الأم" };
const AVAIL: Record<string, string> = { available_now: "متاح الآن", available_soon: "متاح قريبًا", unavailable: "غير متاح" };
// ppt slide-02: private contact (platform/admin only — never rendered on any public profile).
const CONTACT_CHANNELS = [
  { v: "whatsapp", l: "واتساب" },
  { v: "phone", l: "هاتف" },
  { v: "email", l: "بريد إلكتروني" },
  { v: "telegram", l: "تيليجرام" },
];
const IDV_LABEL: Record<string, string> = {
  none: "لم تُرفع بعد", pending: "قيد المراجعة ⏳", approved: "موثّقة ✅", rejected: "مرفوضة ❌",
};
// rule D-1: publishing goes through admin review before the profile is public.
const PUBLISH_STATE: Record<string, { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-line/60 text-sub" },
  pending_review: { label: "بانتظار مراجعة الإدارة ⏳", cls: "bg-warn-t text-warn" },
  published: { label: "منشور ✅", cls: "bg-success-t text-success" },
  rejected: { label: "مرفوض ❌", cls: "bg-warn-t text-warn" },
};

const EMPTY_EMPLOYMENT: WorkerEmployment = { company: "", job_title: "", city: "", country: "", period_from: "", period_to: "", description: "" };
const EMPTY_EDUCATION: WorkerEducation = { school: "", area_of_study: "", degree: "", date_from: "", date_to: "", description: "" };
const EMPTY_LANGUAGE: WorkerLanguage = { name: "", proficiency: "basic" };
const EMPTY_PORTFOLIO = { title: "", description: "", media_type: "image" as PortfolioMediaType, url: "", cover_url: "" };
const EMPTY_CERT: Certificate = { name: "", issuer: "", issued_year: "", verification_link: "" };

const inputCls = "field";

export default function ProfileEditPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<CatalogSkill[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [idv, setIdv] = useState<Idv>({ status: "none" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    Promise.all([
      api<Me>("/auth/me"),
      api<Profile>("/me/profile"),
      api<CatalogSkill[] | { results: CatalogSkill[] }>("/skills"),
      api<Idv>("/me/id-verification"),
      api<CatalogCategory[] | { results: CatalogCategory[] }>("/categories"),
    ])
      .then(([m, p, s, v, cats]) => {
        setMe(m);
        setProfile({
          ...p,
          display_name: p.display_name ?? "",
          intro_video: p.intro_video ?? "",
          cover_image: p.cover_image ?? "",
          main_category: p.main_category ?? null,
          specialization: p.specialization ?? null,
          years_experience: p.years_experience ?? null,
          availability: p.availability ?? "available_now",
          weekly_hours: p.weekly_hours ?? null,
          client_notes: p.client_notes ?? "",
          private_contact_channel: p.private_contact_channel ?? "whatsapp",
          private_contact_value: p.private_contact_value ?? "",
          skills: p.skills ?? [],
          educations: p.educations ?? [],
          employments: p.employments ?? [],
          languages: p.languages ?? [],
          certificates: p.certificates ?? [],
          portfolio: p.portfolio ?? [],
        });
        setCatalog(Array.isArray(s) ? s : s?.results ?? []);
        setIdv(v);
        setCategories(Array.isArray(cats) ? cats : cats?.results ?? []);
      })
      .catch(() => router.replace(signinHereHref()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    if (!me || !profile) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/auth/me", { method: "PATCH", body: JSON.stringify({ first_name: me.first_name, last_name: me.last_name, avatar_url: me.avatar_url || "" }) });
      const updated = await api<Profile>("/me/profile", { method: "PATCH", body: JSON.stringify({
        display_name: profile.display_name,
        bio_title: profile.bio_title,
        overview: profile.overview,
        intro_video: profile.intro_video,
        cover_image: profile.cover_image,
        expertise_level: profile.expertise_level,
        main_category: profile.main_category,
        specialization: profile.specialization,
        years_experience: profile.years_experience,
        hourly_rate: profile.hourly_rate || null,
        availability: profile.availability,
        weekly_hours: profile.weekly_hours,
        client_notes: profile.client_notes,
        private_contact_channel: profile.private_contact_channel || "",
        private_contact_value: profile.private_contact_value,
      }) });
      setProfile((p) => (p ? { ...p, completeness_pct: updated.completeness_pct } : p));
      setMsg({ ok: true, text: "✅ حُفظ ملفك" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusy(false);
    }
  }

  async function saveSkills(skills: Skill[]) {
    setProfile((p) => (p ? { ...p, skills } : p));
    await api("/me/profile", {
      method: "PATCH",
      body: JSON.stringify({ skills: skills.map((s) => ({ skill_id: s.skill_id, efficiency: s.efficiency })) }),
    }).catch(() => undefined);
  }

  /** Replace-all save for a repeatable section (employments / educations / languages). */
  async function saveList<K extends "employments" | "educations" | "languages">(key: K, list: Profile[K]) {
    setProfile((p) => (p ? { ...p, [key]: list } : p));
    try {
      const updated = await api<Profile>("/me/profile", { method: "PATCH", body: JSON.stringify({ [key]: list }) });
      setProfile((p) => (p ? { ...p, completeness_pct: updated.completeness_pct } : p));
      setMsg({ ok: true, text: "✅ تم الحفظ" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    }
  }

  async function addPortfolio(payload: Record<string, unknown>) {
    const item = await api<PortfolioItem>("/me/portfolio", { method: "POST", body: JSON.stringify(payload) });
    setProfile((p) => (p ? { ...p, portfolio: [...p.portfolio, item] } : p));
    setMsg({ ok: true, text: "✅ أُضيف العمل إلى معرضك" });
  }

  async function deletePortfolio(id: number) {
    await api(`/me/portfolio/${id}`, { method: "DELETE" }).catch(() => undefined);
    setProfile((p) => (p ? { ...p, portfolio: p.portfolio.filter((x) => x.id !== id) } : p));
  }

  async function addCert(cert: Record<string, unknown>) {
    const created = await api<Certificate>("/me/certificates", { method: "POST", body: JSON.stringify(cert) });
    setProfile((p) => (p ? { ...p, certificates: [...p.certificates, created] } : p));
    setMsg({ ok: true, text: "✅ أُضيفت الشهادة" });
  }

  async function deleteCert(id?: number) {
    if (!id) return;
    await api(`/me/certificates/${id}`, { method: "DELETE" }).catch(() => undefined);
    setProfile((p) => (p ? { ...p, certificates: p.certificates.filter((c) => c.id !== id) } : p));
  }

  async function submitId(attachmentId: number) {
    try {
      const res = await api<Idv>("/me/id-verification", { method: "POST", body: JSON.stringify({ attachment_ids: [attachmentId] }) });
      setIdv(res);
      setMsg({ ok: true, text: "✅ أُرسلت هويتك للمراجعة" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    }
  }

  if (!me || !profile) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  const available = catalog.filter((c) => !profile.skills.some((s) => s.skill_id === c.id));
  const selectedCat = categories.find((c) => c.id === profile.main_category);
  const specs = selectedCat?.children ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">
          ملفي {profile.is_verified && <span className="rounded-full bg-success-t px-2 py-0.5 text-sm text-success">موثّق ✅</span>}
        </h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${(PUBLISH_STATE[profile.publish_state] ?? PUBLISH_STATE.draft).cls}`}>
          {(PUBLISH_STATE[profile.publish_state] ?? PUBLISH_STATE.draft).label}
        </span>
      </div>
      {profile.publish_state === "rejected" && profile.publish_reject_reason && (
        <p className="mt-1 text-xs text-warn">سبب الرفض: {profile.publish_reject_reason}</p>
      )}

      <div className="mt-2 h-2 w-full rounded-full bg-tint">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${profile.completeness_pct}%` }} aria-label="نسبة اكتمال الملف" />
      </div>
      <p className="mt-1 text-xs text-sub">اكتمال الملف: {profile.completeness_pct}%</p>

      {msg && <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`} role="status">{msg.text}</p>}

      <section className="card mt-6 space-y-3">
        <h2 className="font-bold">المعلومات الأساسية</h2>

        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-content-center overflow-hidden rounded-full bg-tint text-lg font-bold text-primary-dark">
            {me.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={me.avatar_url} alt="" className="h-full w-full object-cover" />
              : (me.first_name?.[0] ?? "؟")}
          </div>
          <div className="flex-1">
            <span className="mb-1 block text-sm font-bold">الصورة الشخصية</span>
            <FileUpload accept="image/*" multiple={false} label="تغيير الصورة"
              onUploaded={(a) => setMe({ ...me, avatar_url: a.url })} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">الاسم الأول
            <input className={`mt-1 ${inputCls}`} value={me.first_name}
              onChange={(e) => setMe({ ...me, first_name: e.target.value })} />
          </label>
          <label className="text-sm font-bold">اسم العائلة
            <input className={`mt-1 ${inputCls}`} value={me.last_name}
              onChange={(e) => setMe({ ...me, last_name: e.target.value })} />
          </label>
        </div>
        <label className="block text-sm font-bold">الاسم المعروض للعملاء
          <input className={`mt-1 ${inputCls}`} placeholder="يظهر بدل اسمك الكامل (اختياري)" value={profile.display_name}
            onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
        </label>
        <label className="block text-sm font-bold">المسمى المهني
          <input className={`mt-1 ${inputCls}`} value={profile.bio_title}
            onChange={(e) => setProfile({ ...profile, bio_title: e.target.value })} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">المجال الرئيسي
            <select className={`mt-1 ${inputCls}`} value={profile.main_category ?? ""}
              onChange={(e) => setProfile({ ...profile, main_category: e.target.value ? Number(e.target.value) : null, specialization: null })}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">التخصص
            <select className={`mt-1 ${inputCls}`} value={profile.specialization ?? ""} disabled={specs.length === 0}
              onChange={(e) => setProfile({ ...profile, specialization: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{specs.length ? "—" : "اختر المجال أولًا"}</option>
              {specs.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-sm font-bold">نبذة
          <textarea className={`mt-1 min-h-24 ${inputCls}`} value={profile.overview}
            onChange={(e) => setProfile({ ...profile, overview: e.target.value })} />
          <ContactHint text={profile.overview} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">مستوى الخبرة
            <select className={`mt-1 ${inputCls}`} value={profile.expertise_level}
              onChange={(e) => setProfile({ ...profile, expertise_level: e.target.value })}>
              <option value="">—</option>
              {Object.entries(LEVELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">سنوات الخبرة
            <input type="number" min={0} className={`mt-1 ${inputCls}`} value={profile.years_experience ?? ""}
              onChange={(e) => setProfile({ ...profile, years_experience: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-bold">سعر الساعة (د.ك)
            <input className={`mt-1 ${inputCls}`} value={profile.hourly_rate ?? ""}
              onChange={(e) => setProfile({ ...profile, hourly_rate: e.target.value })} />
          </label>
          <label className="text-sm font-bold">التوفّر
            <select className={`mt-1 ${inputCls}`} value={profile.availability}
              onChange={(e) => setProfile({ ...profile, availability: e.target.value })}>
              {Object.entries(AVAIL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">ساعات أسبوعيًا
            <input type="number" min={0} className={`mt-1 ${inputCls}`} value={profile.weekly_hours ?? ""}
              onChange={(e) => setProfile({ ...profile, weekly_hours: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </div>

        <label className="block text-sm font-bold">ملاحظات للعملاء
          <input className={`mt-1 ${inputCls}`} placeholder="مثال: متاح للمشاريع الطويلة فقط" value={profile.client_notes}
            onChange={(e) => setProfile({ ...profile, client_notes: e.target.value })} />
        </label>

        {/* ppt slide-02: private contact — للمنصة فقط، لا يظهر في الملف العام */}
        <div>
          <span className="block text-sm font-bold">وسيلة تواصل (للمنصة فقط)</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <select className={`w-36 ${inputCls}`} aria-label="نوع وسيلة التواصل" value={profile.private_contact_channel}
              onChange={(e) => setProfile({ ...profile, private_contact_channel: e.target.value })}>
              {CONTACT_CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
            <input className={`flex-1 ${inputCls}`} dir="ltr" aria-label="وسيلة التواصل"
              placeholder={profile.private_contact_channel === "email" ? "name@example.com" : "+9665…"}
              value={profile.private_contact_value}
              onChange={(e) => setProfile({ ...profile, private_contact_value: e.target.value })} />
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-sub">
            <span aria-hidden>🔒</span> لن تظهر هذه الوسيلة في ملفك العام إطلاقًا — تُستخدم من إدارة المنصة عند الحاجة فقط.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">رابط فيديو تعريفي
            <input className={`mt-1 ${inputCls}`} dir="ltr" placeholder="https://…" value={profile.intro_video}
              onChange={(e) => setProfile({ ...profile, intro_video: e.target.value })} />
          </label>
          <label className="text-sm font-bold">صورة الغلاف (رابط)
            <input className={`mt-1 ${inputCls}`} dir="ltr" placeholder="https://…" value={profile.cover_image}
              onChange={(e) => setProfile({ ...profile, cover_image: e.target.value })} />
          </label>
        </div>

        <button className="btn-primary" disabled={busy} onClick={saveProfile}>
          {busy ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </section>

      <section className="card mt-6">
        <h2 className="font-bold">المهارات</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {profile.skills.map((s) => (
            <li key={s.skill_id} className="flex items-center gap-2 rounded-full bg-tint px-3 py-1 text-sm">
              {s.name} <span className="text-xs text-sub">({EFF[s.efficiency] ?? s.efficiency})</span>
              <button aria-label={`حذف ${s.name}`} className="text-danger"
                onClick={() => saveSkills(profile.skills.filter((x) => x.skill_id !== s.skill_id))}>×</button>
            </li>
          ))}
          {profile.skills.length === 0 && <li className="text-sm text-sub">لا مهارات بعد</li>}
        </ul>
        {available.length > 0 && (
          <select className="field mt-3" defaultValue=""
            aria-label="أضف مهارة"
            onChange={(e) => {
              const id = Number(e.target.value);
              const skill = catalog.find((c) => c.id === id);
              if (skill) saveSkills([...profile.skills, { skill_id: id, name: skill.name_ar, efficiency: "intermediate" }]);
              e.target.value = "";
            }}>
            <option value="" disabled>+ أضف مهارة</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
          </select>
        )}
      </section>

      {/* الخبرات العملية */}
      <ExperienceSection items={profile.employments} onChange={(list) => saveList("employments", list)} />

      {/* التعليم */}
      <EducationSection items={profile.educations} onChange={(list) => saveList("educations", list)} />

      {/* اللغات */}
      <LanguagesSection items={profile.languages} onChange={(list) => saveList("languages", list)} />

      {/* الشهادات */}
      <CertificatesSection items={profile.certificates} onAdd={addCert} onDelete={deleteCert} onError={(t) => setMsg({ ok: false, text: t })} />

      {/* معرض الأعمال */}
      <PortfolioSection items={profile.portfolio} onAdd={addPortfolio} onDelete={deletePortfolio} onError={(t) => setMsg({ ok: false, text: t })} />

      <section className="card mt-6">
        <h2 className="font-bold">توثيق الهوية</h2>
        <p className="mt-1 text-sm text-sub">الحالة: {IDV_LABEL[idv.status]}{idv.status === "rejected" && idv.reject_reason ? ` — ${idv.reject_reason}` : ""}</p>
        {idv.status !== "approved" && idv.status !== "pending" && (
          <div className="mt-3">
            <FileUpload accept="image/*,application/pdf" multiple={false} label="ارفع صورة الهوية الوطنية"
              onUploaded={(a) => submitId(a.id)} />
          </div>
        )}
      </section>
    </main>
  );
}

/* ── repeatable sections ───────────────────────────────────────────────── */

function ExperienceSection({ items, onChange }: { items: WorkerEmployment[]; onChange: (l: WorkerEmployment[]) => void }) {
  const [draft, setDraft] = useState<WorkerEmployment>(EMPTY_EMPLOYMENT);
  const canAdd = draft.company.trim() && draft.job_title.trim();
  return (
    <section className="card mt-6">
      <h2 className="font-bold">الخبرات العملية</h2>
      <ul className="mt-3 space-y-2">
        {items.map((e, i) => (
          <li key={i} className="flex items-start justify-between gap-3 rounded-m bg-bg px-3 py-2">
            <div className="min-w-0">
              <p className="font-bold">{e.job_title} <span className="font-normal text-sub">— {e.company}</span></p>
              <p className="text-xs text-sub">{[e.period_from, e.period_to || "الآن"].filter(Boolean).join(" – ")}{e.city ? ` · ${e.city}` : ""}</p>
            </div>
            <button aria-label="حذف الخبرة" className="shrink-0 text-danger" onClick={() => onChange(items.filter((_, j) => j !== i))}><TrashIcon className="text-[18px]" /></button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-sub">لا خبرات بعد</li>}
      </ul>
      <div className="mt-4 grid gap-2 rounded-m border border-dashed border-line-strong p-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="المسمى الوظيفي" aria-label="المسمى الوظيفي" value={draft.job_title} onChange={(e) => setDraft({ ...draft, job_title: e.target.value })} />
        <input className={inputCls} placeholder="الشركة" aria-label="الشركة" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
        <input className={inputCls} placeholder="من (مثال: 2021)" aria-label="من" value={draft.period_from} onChange={(e) => setDraft({ ...draft, period_from: e.target.value })} />
        <input className={inputCls} placeholder="إلى (اتركه فارغًا للحالي)" aria-label="إلى" value={draft.period_to} onChange={(e) => setDraft({ ...draft, period_to: e.target.value })} />
        <textarea className={`sm:col-span-2 ${inputCls}`} placeholder="وصف مختصر (اختياري)" aria-label="وصف الخبرة" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <button className="btn-secondary w-fit sm:col-span-2" disabled={!canAdd}
          onClick={() => { onChange([...items, draft]); setDraft(EMPTY_EMPLOYMENT); }}>
          <PlusIcon className="text-[16px]" /> إضافة خبرة
        </button>
      </div>
    </section>
  );
}

function EducationSection({ items, onChange }: { items: WorkerEducation[]; onChange: (l: WorkerEducation[]) => void }) {
  const [draft, setDraft] = useState<WorkerEducation>(EMPTY_EDUCATION);
  const canAdd = draft.school.trim();
  return (
    <section className="card mt-6">
      <h2 className="font-bold">التعليم</h2>
      <ul className="mt-3 space-y-2">
        {items.map((ed, i) => (
          <li key={i} className="flex items-start justify-between gap-3 rounded-m bg-bg px-3 py-2">
            <div className="min-w-0">
              <p className="font-bold">{ed.school}</p>
              <p className="text-xs text-sub">{[ed.degree, ed.area_of_study].filter(Boolean).join(" · ")}{(ed.date_from || ed.date_to) ? ` · ${ed.date_from} – ${ed.date_to}` : ""}</p>
            </div>
            <button aria-label="حذف التعليم" className="shrink-0 text-danger" onClick={() => onChange(items.filter((_, j) => j !== i))}><TrashIcon className="text-[18px]" /></button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-sub">لا مؤهلات بعد</li>}
      </ul>
      <div className="mt-4 grid gap-2 rounded-m border border-dashed border-line-strong p-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="الجامعة / المدرسة" aria-label="الجامعة" value={draft.school} onChange={(e) => setDraft({ ...draft, school: e.target.value })} />
        <input className={inputCls} placeholder="الدرجة (مثال: بكالوريوس)" aria-label="الدرجة" value={draft.degree} onChange={(e) => setDraft({ ...draft, degree: e.target.value })} />
        <input className={inputCls} placeholder="التخصص" aria-label="التخصص" value={draft.area_of_study} onChange={(e) => setDraft({ ...draft, area_of_study: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputCls} placeholder="من" aria-label="من" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          <input className={inputCls} placeholder="إلى" aria-label="إلى" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
        </div>
        <button className="btn-secondary w-fit sm:col-span-2" disabled={!canAdd}
          onClick={() => { onChange([...items, draft]); setDraft(EMPTY_EDUCATION); }}>
          <PlusIcon className="text-[16px]" /> إضافة مؤهل
        </button>
      </div>
    </section>
  );
}

function LanguagesSection({ items, onChange }: { items: WorkerLanguage[]; onChange: (l: WorkerLanguage[]) => void }) {
  const [draft, setDraft] = useState<WorkerLanguage>(EMPTY_LANGUAGE);
  return (
    <section className="card mt-6">
      <h2 className="font-bold">اللغات</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((l, i) => (
          <li key={i} className="flex items-center gap-2 rounded-full bg-tint px-3 py-1 text-sm">
            {l.name} <span className="text-xs text-sub">({PROF[l.proficiency] ?? l.proficiency})</span>
            <button aria-label={`حذف ${l.name}`} className="text-danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-sub">لا لغات بعد</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-40`} placeholder="اللغة" aria-label="اللغة" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <select className={`${inputCls} w-32`} aria-label="المستوى" value={draft.proficiency} onChange={(e) => setDraft({ ...draft, proficiency: e.target.value })}>
          {Object.entries(PROF).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn-secondary" disabled={!draft.name.trim()}
          onClick={() => { onChange([...items, draft]); setDraft(EMPTY_LANGUAGE); }}>
          <PlusIcon className="text-[16px]" /> إضافة لغة
        </button>
      </div>
    </section>
  );
}

function CertificatesSection({
  items, onAdd, onDelete, onError,
}: {
  items: Certificate[];
  onAdd: (cert: Record<string, unknown>) => Promise<void>;
  onDelete: (id?: number) => void;
  onError: (text: string) => void;
}) {
  const [draft, setDraft] = useState<Certificate>(EMPTY_CERT);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.name.trim()) { onError("أدخل اسم الشهادة"); return; }
    setBusy(true);
    try {
      await onAdd({
        name: draft.name,
        issuer: draft.issuer,
        issued_year: draft.issued_year ? Number(draft.issued_year) : null,
        verification_link: draft.verification_link,
      });
      setDraft(EMPTY_CERT);
    } catch (e) {
      onError(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-6">
      <h2 className="font-bold">الشهادات والدورات</h2>
      <p className="mt-1 text-sm text-sub">أضف شهاداتك ودوراتك التدريبية لتعزيز ثقة العملاء.</p>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-m bg-bg p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-bold">{c.name}</p>
                <p className="truncate text-xs text-sub">{[c.issuer, c.issued_year].filter(Boolean).join(" · ")}</p>
              </div>
              <button aria-label={`حذف ${c.name}`} className="shrink-0 text-danger" onClick={() => onDelete(c.id)}>
                <TrashIcon className="text-[16px]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3 rounded-m border border-dashed border-line-strong p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="field" placeholder="اسم الشهادة" aria-label="اسم الشهادة" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="field" placeholder="الجهة المانحة" aria-label="الجهة المانحة" value={draft.issuer} onChange={(e) => setDraft({ ...draft, issuer: e.target.value })} />
          <input type="number" className="field" placeholder="سنة الإصدار" aria-label="سنة الإصدار" value={draft.issued_year} onChange={(e) => setDraft({ ...draft, issued_year: e.target.value })} />
          <input className="field" dir="ltr" placeholder="رابط التحقق (اختياري)" aria-label="رابط التحقق" value={draft.verification_link} onChange={(e) => setDraft({ ...draft, verification_link: e.target.value })} />
        </div>
        <button className="btn-secondary w-fit" disabled={busy} onClick={submit}>{busy ? "جارٍ الإضافة…" : "+ إضافة شهادة"}</button>
      </div>
    </section>
  );
}

function PortfolioSection({
  items, onAdd, onDelete, onError,
}: {
  items: PortfolioItem[];
  onAdd: (payload: Record<string, unknown>) => Promise<void>;
  onDelete: (id: number) => void;
  onError: (text: string) => void;
}) {
  const [draft, setDraft] = useState(EMPTY_PORTFOLIO);
  const [busy, setBusy] = useState(false);
  const reset = () => setDraft(EMPTY_PORTFOLIO);

  async function submit(extra: Record<string, unknown>) {
    if (!draft.title.trim()) { onError("أدخل عنوانًا للعمل أولًا"); return; }
    setBusy(true);
    try {
      await onAdd({ title: draft.title, description: draft.description, media_type: draft.media_type, url: draft.url, cover_url: draft.cover_url, ...extra });
      reset();
    } catch (e) {
      onError(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  const TYPES: { v: PortfolioMediaType; l: string; Icon: typeof ImageIcon }[] = [
    { v: "image", l: "صورة", Icon: ImageIcon },
    { v: "video", l: "فيديو", Icon: PlayIcon },
    { v: "link", l: "رابط", Icon: ExternalLinkIcon },
  ];

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><GridIcon className="text-[18px] text-primary" /> معرض الأعمال</h2>
        <a href="/me/portfolio/new" className="btn-secondary inline-flex items-center gap-1 text-sm"><PlusIcon className="text-[15px]" /> إضافة بالتفاصيل</a>
      </div>
      <p className="mt-1 text-sm text-sub">اعرض مشاريعك الحيّة — صورة مرفوعة، رابط مشروع، أو فيديو (يوتيوب/فيميو). للتفاصيل الكاملة (نوع المشروع، المهارات، المدة) استخدم «إضافة بالتفاصيل».</p>

      {items.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((p) => {
            const thumb = p.media_type === "image" ? p.image_url || p.url : p.cover_url;
            return (
              <div key={p.id} className="card-modern group overflow-hidden">
                <div className="relative aspect-video bg-tint">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={p.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="cover-c grid h-full w-full place-content-center text-2xl text-white/90">
                      {p.media_type === "video" ? <PlayIcon /> : <ExternalLinkIcon />}
                    </div>
                  )}
                  <button aria-label="حذف العمل" onClick={() => onDelete(p.id)}
                    className="absolute end-2 top-2 grid h-7 w-7 place-content-center rounded-full bg-white/90 text-danger shadow-sm transition hover:bg-danger hover:text-white">
                    <TrashIcon className="text-[16px]" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <p className="truncate text-sm font-bold">{p.title}</p>
                  <a href={`/me/portfolio/${p.id}`} className="shrink-0 text-xs font-medium text-primary-dark hover:underline">تعديل</a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 space-y-3 rounded-m border border-dashed border-line-strong p-3">
        <div className="flex gap-2">
          {TYPES.map(({ v, l, Icon }) => (
            <button key={v} type="button" onClick={() => setDraft({ ...draft, media_type: v })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${draft.media_type === v ? "bg-primary text-white" : "bg-tint text-sub"}`}>
              <Icon className="text-[15px]" /> {l}
            </button>
          ))}
        </div>
        <input className={inputCls} placeholder="عنوان العمل" aria-label="عنوان العمل" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <textarea className={`min-h-16 ${inputCls}`} placeholder="وصف مختصر (اختياري)" aria-label="وصف العمل" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />

        {draft.media_type === "image" ? (
          <div className="space-y-2">
            <FileUpload accept="image/*" multiple={false} label="ارفع صورة العمل"
              onUploaded={(a) => submit({ attachment_ids: [a.id] })} />
            <p className="text-center text-xs text-sub">أو</p>
            <div className="flex gap-2">
              <input className={inputCls} placeholder="ألصق رابط صورة (https://…)" aria-label="رابط الصورة" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
              <button className="btn-secondary shrink-0" disabled={busy || !draft.url.trim()} onClick={() => submit({})}>إضافة</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input className={inputCls} placeholder={draft.media_type === "video" ? "رابط الفيديو (يوتيوب/فيميو)" : "رابط المشروع (https://…)"} aria-label="الرابط" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            <input className={inputCls} placeholder="رابط صورة مصغّرة (اختياري)" aria-label="صورة مصغرة" value={draft.cover_url} onChange={(e) => setDraft({ ...draft, cover_url: e.target.value })} />
            <button className="btn-secondary w-fit" disabled={busy || !draft.url.trim()} onClick={() => submit({})}>
              <PlusIcon className="text-[16px]" /> إضافة العمل
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

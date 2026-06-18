"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens, type Me } from "@/lib/api";
import { apiError } from "@/lib/errors";
import FileUpload from "@/components/FileUpload";

type Skill = { skill_id: number; name: string; efficiency: string };
type Profile = {
  bio_title: string;
  overview: string;
  expertise_level: string;
  hourly_rate: string | null;
  is_verified: boolean;
  completeness_pct: number;
  skills: Skill[];
};
type CatalogSkill = { id: number; name_ar: string };
type Idv = { status: "none" | "pending" | "approved" | "rejected"; reject_reason?: string };

const LEVELS: Record<string, string> = { entry: "مبتدئ", intermediate: "متوسط", expert: "خبير" };
const EFF: Record<string, string> = { beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم" };
const IDV_LABEL: Record<string, string> = {
  none: "لم تُرفع بعد", pending: "قيد المراجعة ⏳", approved: "موثّقة ✅", rejected: "مرفوضة ❌",
};

export default function ProfileEditPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<CatalogSkill[]>([]);
  const [idv, setIdv] = useState<Idv>({ status: "none" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    Promise.all([
      api<Me>("/auth/me"),
      api<Profile>("/me/profile"),
      api<CatalogSkill[]>("/skills"),
      api<Idv>("/me/id-verification"),
    ])
      .then(([m, p, s, v]) => { setMe(m); setProfile(p); setCatalog(s); setIdv(v); })
      .catch(() => router.replace("/signin"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    if (!me || !profile) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/auth/me", { method: "PATCH", body: JSON.stringify({ first_name: me.first_name, last_name: me.last_name }) });
      await api("/me/profile", { method: "PATCH", body: JSON.stringify({
        bio_title: profile.bio_title, overview: profile.overview,
        expertise_level: profile.expertise_level, hourly_rate: profile.hourly_rate || null,
      }) });
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">
          ملفي {profile.is_verified && <span className="rounded-full bg-success-t px-2 py-0.5 text-sm text-success">موثّق ✅</span>}
        </h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>

      <div className="mt-2 h-2 w-full rounded-full bg-tint">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${profile.completeness_pct}%` }} aria-label="نسبة اكتمال الملف" />
      </div>
      <p className="mt-1 text-xs text-sub">اكتمال الملف: {profile.completeness_pct}%</p>

      {msg && <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`} role="status">{msg.text}</p>}

      <section className="card mt-6 space-y-3">
        <h2 className="font-bold">المعلومات الأساسية</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">الاسم الأول
            <input className="mt-1 w-full rounded-m border border-line-strong px-3 py-2" value={me.first_name}
              onChange={(e) => setMe({ ...me, first_name: e.target.value })} />
          </label>
          <label className="text-sm font-bold">اسم العائلة
            <input className="mt-1 w-full rounded-m border border-line-strong px-3 py-2" value={me.last_name}
              onChange={(e) => setMe({ ...me, last_name: e.target.value })} />
          </label>
        </div>
        <label className="block text-sm font-bold">المسمى المهني
          <input className="mt-1 w-full rounded-m border border-line-strong px-3 py-2" value={profile.bio_title}
            onChange={(e) => setProfile({ ...profile, bio_title: e.target.value })} />
        </label>
        <label className="block text-sm font-bold">نبذة
          <textarea className="mt-1 min-h-24 w-full rounded-m border border-line-strong px-3 py-2" value={profile.overview}
            onChange={(e) => setProfile({ ...profile, overview: e.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">مستوى الخبرة
            <select className="mt-1 w-full rounded-m border border-line-strong px-3 py-2" value={profile.expertise_level}
              onChange={(e) => setProfile({ ...profile, expertise_level: e.target.value })}>
              <option value="">—</option>
              {Object.entries(LEVELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">سعر الساعة ($)
            <input className="mt-1 w-full rounded-m border border-line-strong px-3 py-2" value={profile.hourly_rate ?? ""}
              onChange={(e) => setProfile({ ...profile, hourly_rate: e.target.value })} />
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
          <select className="mt-3 rounded-m border border-line-strong px-3 py-2 text-sm" defaultValue=""
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

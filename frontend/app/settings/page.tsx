"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";

type Prefs = { chat_unread: boolean; job_alerts: boolean; proposal_updates: boolean; marketing: boolean };
type Profile = { visibility: "online" | "offline" };
type Blocker = { code: string; message_ar: string; settlement?: string };

const PREF_LABEL: Record<keyof Prefs, string> = {
  chat_unread: "تنبيهات الرسائل غير المقروءة",
  job_alerts: "وظائف جديدة في فئاتي المشترك بها",
  proposal_updates: "تحديثات عروضي",
  marketing: "إعلانات وعروض المنصة",
};

export default function SettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [visibility, setVisibility] = useState<"online" | "offline">("online");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    Promise.all([api<Prefs>("/me/notification-preferences"), api<Profile>("/me/profile")])
      .then(([p, profile]) => {
        setPrefs(p);
        setVisibility(profile.visibility);
      })
      .catch(() => router.replace("/signin"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function togglePref(key: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await api("/me/notification-preferences", { method: "PUT", body: JSON.stringify({ [key]: next[key] }) })
      .catch(() => setPrefs(prefs)); // revert on failure
  }

  async function toggleVisibility() {
    const next = visibility === "online" ? "offline" : "online";
    setVisibility(next);
    await api("/me/profile", { method: "PATCH", body: JSON.stringify({ visibility: next }) })
      .catch(() => setVisibility(visibility));
  }

  async function deleteAccount() {
    setMsg(null);
    setBlockers(null);
    try {
      await api("/auth/me", { method: "DELETE", body: JSON.stringify({ reason: reason || "user_request" }) });
      tokens.clear();
      router.push("/");
    } catch (e) {
      const body = (e as { body?: { blockers?: Blocker[] } }).body;
      if (body?.blockers?.length) setBlockers(body.blockers);
      else setMsg({ ok: false, text: apiError(e).message_ar });
    }
  }

  if (!prefs) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">الإعدادات</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>

      {msg && <p className="mt-4 rounded-m bg-warn-t p-3 text-sm text-warn">{msg.text}</p>}

      <section className="card mt-6">
        <h2 className="font-bold">الظهور على المنصة</h2>
        <p className="mt-1 text-sm text-sub">
          عند الإخفاء لا تظهر في دليل المستقلين. سنذكّرك بالعودة بعد فترة من الغياب.
        </p>
        <label className="mt-3 flex cursor-pointer items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${visibility === "online" ? "bg-emerald-500" : "bg-line-strong"}`} />
            {visibility === "online" ? "ظاهر" : "مخفي"}
          </span>
          <input type="checkbox" checked={visibility === "online"} onChange={toggleVisibility}
            aria-label="الظهور على المنصة" className="h-5 w-5" />
        </label>
      </section>

      <section className="card mt-6">
        <h2 className="font-bold">تفضيلات الإشعارات</h2>
        <ul className="mt-3 space-y-3">
          {(Object.keys(PREF_LABEL) as (keyof Prefs)[]).map((key) => (
            <li key={key} className="flex items-center justify-between">
              <span className="text-sm">{PREF_LABEL[key]}</span>
              <input type="checkbox" checked={prefs[key]} onChange={() => togglePref(key)}
                aria-label={PREF_LABEL[key]} className="h-5 w-5" />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-sub">الإشعارات المتعلقة بعقودك ومدفوعاتك تصلك دائمًا.</p>
      </section>

      <section className="card mt-6 border-danger/30">
        <h2 className="font-bold text-danger">حذف الحساب</h2>
        <p className="mt-1 text-sm text-sub">
          حذف نهائي لملفك العام. يُمنع الحذف ما دام لديك عقد جارٍ أو رصيد أو طلب سحب أو طلب خدمة معلّق.
        </p>

        {blockers && (
          <div className="mt-3 rounded-m bg-warn-t p-3 text-sm text-warn">
            <p className="font-bold">لا يمكن حذف الحساب الآن:</p>
            <ul className="mt-1 list-inside list-disc">
              {blockers.map((b) => <li key={b.code}>{b.message_ar}</li>)}
            </ul>
          </div>
        )}

        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="mt-3 rounded-m border border-danger px-4 py-2 text-sm text-danger">
            أريد حذف حسابي
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <input className="w-full rounded-m border border-line-strong px-3 py-2 text-sm"
              placeholder="سبب الحذف (اختياري)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={deleteAccount} className="btn-primary bg-danger">تأكيد الحذف النهائي</button>
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary">إلغاء</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

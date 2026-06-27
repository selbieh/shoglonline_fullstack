"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens, type Me } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError, isAuthError } from "@/lib/errors";

/* Account info (ppt slide-31) — name, email, deactivate, delete — plus visibility +
   notification preferences. Rendered inside the settings shell (layout.tsx). */

type Prefs = { chat_unread: boolean; job_alerts: boolean; proposal_updates: boolean; marketing: boolean };
type Profile = { visibility: "online" | "offline" };
type Blocker = { code: string; message_ar: string; settlement?: string };

const PREF_LABEL: Record<keyof Prefs, string> = {
  chat_unread: "تنبيهات الرسائل غير المقروءة",
  job_alerts: "وظائف جديدة في فئاتي المشترك بها",
  proposal_updates: "تحديثات عروضي",
  marketing: "إعلانات وعروض المنصة",
};

export default function AccountInfoPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState({ first_name: "", last_name: "" });
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [visibility, setVisibility] = useState<"online" | "offline">("online");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState("");
  // email change (slide-31)
  const [emailEdit, setEmailEdit] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailToken, setEmailToken] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  // P2-10: a basic local-part@domain.tld shape so we don't enable "send code" for blank/garbage input.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());

  const loadAccount = useCallback(() => {
    setLoadError(false);
    // BUG-05: load the three panels independently so one transient/5xx failure doesn't blank the
    // whole page or eject an authenticated user. Only a genuine 401 bounces to sign-in.
    Promise.allSettled([
      api<Me>("/auth/me"),
      api<Prefs>("/me/notification-preferences"),
      api<Profile>("/me/profile"),
    ]).then(([uRes, pRes, profileRes]) => {
      const authFailed = [uRes, pRes, profileRes].some(
        (r) => r.status === "rejected" && isAuthError(r.reason),
      );
      if (authFailed) {
        router.replace(signinHereHref());
        return;
      }
      if (uRes.status === "fulfilled") {
        setMe(uRes.value);
        setName({ first_name: uRes.value.first_name, last_name: uRes.value.last_name });
      }
      if (pRes.status === "fulfilled") setPrefs(pRes.value);
      if (profileRes.status === "fulfilled") setVisibility(profileRes.value.visibility);
      // Account + prefs are required to render the shell; flag a retry if either failed.
      if (uRes.status === "rejected" || pRes.status === "rejected") setLoadError(true);
    });
  }, [router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    loadAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestEmailChange() {
    setEmailBusy(true);
    setEmailMsg("");
    try {
      const r = await api<{ sent: boolean; debug_token?: string }>("/auth/me/email/request-change", {
        method: "POST", body: JSON.stringify({ email: newEmail.trim() }),
      });
      setEmailSent(true);
      setEmailMsg(r.debug_token ? `رمز التطوير: ${r.debug_token}` : "أرسلنا رمز تأكيد إلى بريدك الجديد");
    } catch (e) {
      setEmailMsg(apiError(e).message_ar);
    } finally {
      setEmailBusy(false);
    }
  }

  async function confirmEmailChange() {
    setEmailBusy(true);
    setEmailMsg("");
    try {
      const u = await api<Me>("/auth/me/email/confirm", { method: "POST", body: JSON.stringify({ token: emailToken }) });
      setMe(u);
      setEmailEdit(false);
      setEmailSent(false);
      setNewEmail("");
      setEmailToken("");
      setMsg({ ok: true, text: "✅ تم تغيير البريد الإلكتروني" });
    } catch (e) {
      setEmailMsg(apiError(e).message_ar);
    } finally {
      setEmailBusy(false);
    }
  }

  async function saveName() {
    setSavingName(true);
    setMsg(null);
    try {
      await api("/auth/me", { method: "PATCH", body: JSON.stringify(name) });
      setMsg({ ok: true, text: "✅ تم حفظ معلومات الحساب" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setSavingName(false);
    }
  }

  async function togglePref(key: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await api("/me/notification-preferences", { method: "PUT", body: JSON.stringify({ [key]: next[key] }) })
      .catch(() => setPrefs(prefs));
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

  if (!me || !prefs) {
    if (loadError)
      return (
        <div className="rounded-m bg-warn-t p-6 text-center text-warn" role="alert">
          <p className="font-bold">تعذّر تحميل إعدادات الحساب</p>
          <p className="mt-1 text-sm">تحقّق من اتصالك ثم حاول مجددًا</p>
          <button onClick={loadAccount} className="btn-secondary mt-4 text-sm">إعادة المحاولة</button>
        </div>
      );
    return <p className="text-sub">جارٍ التحميل…</p>;
  }

  return (
    <>
      {msg && (
        <p className={`rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`} role="status">
          {msg.text}
        </p>
      )}

      {/* account info */}
      <section className="card">
        <h2 className="font-bold">معلومات الحساب</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">الاسم الأول</span>
            <input className="field" value={name.first_name} onChange={(e) => setName({ ...name, first_name: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">الاسم الأخير</span>
            <input className="field" value={name.last_name} onChange={(e) => setName({ ...name, last_name: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 block">
          <span className="mb-1.5 flex items-center justify-between text-sm font-medium">
            <label htmlFor="account-email">البريد الإلكتروني</label>
            {!emailEdit && (
              <button type="button" className="text-xs font-medium text-primary-dark hover:underline"
                onClick={() => { setEmailEdit(true); setNewEmail(""); setEmailSent(false); setEmailMsg(""); }}>تغيير</button>
            )}
          </span>
          <input id="account-email" className="field bg-bg" dir="ltr" value={me.email} disabled readOnly />
          {emailEdit && (
            <div className="mt-2 space-y-2 rounded-m border border-dashed border-line-strong p-3">
              {!emailSent ? (
                <>
                  <input className="field" dir="ltr" type="email" placeholder="البريد الإلكتروني الجديد"
                    aria-label="البريد الإلكتروني الجديد"
                    value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary disabled:opacity-50" disabled={emailBusy || !emailValid}
                      onClick={requestEmailChange}>إرسال رمز التأكيد</button>
                    <button type="button" className="btn-secondary" onClick={() => setEmailEdit(false)}>إلغاء</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-sub">أدخل رمز التأكيد المُرسل إلى <span dir="ltr">{newEmail}</span></p>
                  <input className="field" dir="ltr" placeholder="رمز التأكيد"
                    value={emailToken} onChange={(e) => setEmailToken(e.target.value)} />
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary disabled:opacity-50" disabled={emailBusy || !emailToken}
                      onClick={confirmEmailChange}>تأكيد التغيير</button>
                    <button type="button" className="text-sm font-medium text-primary-dark disabled:opacity-40"
                      disabled={emailBusy} onClick={requestEmailChange}>إعادة الإرسال</button>
                  </div>
                </>
              )}
              {emailMsg && <p className="text-xs text-sub">{emailMsg}</p>}
            </div>
          )}
        </div>
        <button className="btn-primary mt-4" disabled={savingName} onClick={saveName}>
          {savingName ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </section>

      {/* visibility */}
      <section className="card">
        <h2 className="font-bold">الظهور على المنصة</h2>
        <p className="mt-1 text-sm text-sub">عند الإخفاء لا تظهر في دليل المستقلين. سنذكّرك بالعودة بعد فترة من الغياب.</p>
        <label className="mt-3 flex cursor-pointer items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${visibility === "online" ? "bg-success" : "bg-line-strong"}`} />
            {visibility === "online" ? "ظاهر" : "مخفي"}
          </span>
          <input type="checkbox" checked={visibility === "online"} onChange={toggleVisibility} aria-label="الظهور على المنصة" className="h-5 w-5" />
        </label>
      </section>

      {/* notification preferences */}
      <section className="card">
        <h2 className="font-bold">تفضيلات الإشعارات</h2>
        <ul className="mt-3 space-y-3">
          {(Object.keys(PREF_LABEL) as (keyof Prefs)[]).map((key) => (
            <li key={key} className="flex items-center justify-between">
              <span className="text-sm">{PREF_LABEL[key]}</span>
              <input type="checkbox" checked={prefs[key]} onChange={() => togglePref(key)} aria-label={PREF_LABEL[key]} className="h-5 w-5" />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-sub">الإشعارات المتعلقة بعقودك ومدفوعاتك تصلك دائمًا.</p>
      </section>

      {/* danger zone */}
      <section className="card border-danger/30">
        <h2 className="font-bold text-danger">حذف الحساب</h2>
        <p className="mt-1 text-sm text-sub">
          حذف نهائي لملفك العام. يُمنع الحذف ما دام لديك عقد جارٍ أو رصيد أو طلب سحب أو طلب خدمة معلّق.
        </p>
        {blockers && (
          <div className="mt-3 rounded-m bg-warn-t p-3 text-sm text-warn" role="alert" aria-live="assertive">
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
            <input className="field" placeholder="سبب الحذف (اختياري)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={deleteAccount} className="btn-primary bg-danger hover:bg-danger">تأكيد الحذف النهائي</button>
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary">إلغاء</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

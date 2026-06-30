"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import { useFieldErrors } from "@/lib/useFieldErrors";
import { fetchPublicSettings, phoneVerifyEnabled } from "@/lib/settings";
import { digitsOnly } from "@/lib/arabic";
import Logo from "@/components/Logo";
import Field from "@/components/Field";
import PhoneField from "@/components/PhoneField";
import WizardStepper, { type WizardStep } from "@/components/WizardStepper";
import { splitPhone } from "@/lib/countries";

/* Employer profile setup (أنشئ ملفك كصاحب عمل — ppt slides 26/27): basic data + optional
   verification. Built on /me/employer-profile + the shared phone-OTP endpoints. */

type Me = { email: string; email_verified: boolean; phone_verified: boolean };

const STEPS: WizardStep[] = [
  { id: "basic", label: "البيانات الأساسية" },
  { id: "verify", label: "التحقق من الحساب", optional: true },
];

export default function EmployerWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ company_name: "", field: "", country: "", city: "", timezone: "", logo_url: "" });
  const [me, setMe] = useState<Me>({ email: "", email_verified: false, phone_verified: false });
  const [busy, setBusy] = useState(false);
  const { errors, setErrors, clearFields, formError, setFormError, applyApiError } = useFieldErrors();
  // verify
  const [phoneIntl, setPhoneIntl] = useState("+966");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [vmsg, setVmsg] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneVerifyOn, setPhoneVerifyOn] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    api<Partial<typeof form>>("/me/employer-profile")
      .then((p) => setForm((f) => ({
        ...f,
        company_name: String(p.company_name ?? ""),
        field: String(p.field ?? ""),
        country: String(p.country ?? ""),
        city: String(p.city ?? ""),
        timezone: String(p.timezone ?? ""),
        logo_url: String(p.logo_url ?? ""),
      })))
      .catch(() => {});
    api<Me>("/auth/me")
      .then((u) => { setMe({ email: u.email, email_verified: !!u.email_verified, phone_verified: !!u.phone_verified }); setPhoneVerified(!!u.phone_verified); })
      .catch(() => {});
    fetchPublicSettings().then((s) => setPhoneVerifyOn(phoneVerifyEnabled(s))).catch(() => {});
  }, [router]);

  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    clearFields(...Object.keys(patch));
  };
  const phoneOk = phoneVerified || me.phone_verified;

  async function goNext() {
    setFormError("");
    if (step === 0 && !form.company_name.trim()) {
      setErrors({ company_name: "أدخل اسم الشركة / الجهة" });
      setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (step === 0) {
        await api("/me/employer-profile", { method: "PATCH", body: JSON.stringify(form) });
        setStep(1);
      } else {
        router.push("/dashboard");
      }
    } catch (e) {
      // field-keyed errors (company_name, logo_url, …) mark their inputs; the rest is a banner.
      const keys = applyApiError(e);
      if (keys.length) setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp() {
    setOtpBusy(true); setVmsg("");
    try {
      const r = await api<{ sent: boolean; debug_code?: string }>("/auth/phone/request-otp", {
        method: "POST", body: JSON.stringify({ phone: phoneIntl }),
      });
      setOtpSent(true);
      setVmsg(r.debug_code ? `رمز التطوير: ${r.debug_code}` : "تم إرسال الرمز إلى جوالك");
    } catch (e) { setVmsg(apiError(e).message_ar); } finally { setOtpBusy(false); }
  }

  async function verifyOtp() {
    setOtpBusy(true); setVmsg("");
    try {
      await api("/auth/phone/verify-otp", { method: "POST", body: JSON.stringify({ code }) });
      setPhoneVerified(true); setVmsg("تم التحقق من رقم الجوال ✓");
    } catch (e) { setVmsg(apiError(e).message_ar); } finally { setOtpBusy(false); }
  }

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <main dir="rtl" className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Logo className="h-9 w-auto" href="/" />
          <p className="text-sm font-bold text-ink">أنشئ ملفك كصاحب عمل</p>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-extrabold">{STEPS[step].label}</h1>

        {step === 0 && (
          <div className="mt-6 space-y-5">
            <p className="text-sm text-sub">عرّف شركتك ليسهل على المستقلين التواصل معك وتنفيذ المشاريع.</p>
            <Field label="الاسم (الشركة / الجهة)" required error={errors.company_name}>
              <input className="field" value={form.company_name} placeholder="اكتب اسم الشركة / الجهة"
                onChange={(e) => set({ company_name: e.target.value })} />
            </Field>
            <Field label="المجال" error={errors.field}>
              <input className="field" value={form.field} placeholder="اختر المجال الذي يصف عملك"
                onChange={(e) => set({ field: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الدولة" error={errors.country}>
                <input className="field" value={form.country} placeholder="الدولة"
                  onChange={(e) => set({ country: e.target.value })} />
              </Field>
              <Field label="المدينة" error={errors.city}>
                <input className="field" value={form.city} placeholder="المدينة"
                  onChange={(e) => set({ city: e.target.value })} />
              </Field>
            </div>
            <Field label="المنطقة الزمنية" error={errors.timezone}>
              <input className="field" value={form.timezone} placeholder="اختر منطقتك الزمنية"
                onChange={(e) => set({ timezone: e.target.value })} />
            </Field>
            <Field label="رابط شعار الشركة (اختياري)" error={errors.logo_url}>
              <input className="field" dir="ltr" value={form.logo_url} placeholder="https://…"
                onChange={(e) => set({ logo_url: e.target.value })} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-sub">أكمل خطوات التحقق لزيادة الثقة بحسابك وتسهيل التعامل داخل المنصة.</p>
            <div className="flex items-center justify-between rounded-l border border-line bg-white p-4">
              <div>
                <p className="text-sm font-medium text-ink">البريد الإلكتروني</p>
                <p className="text-sm text-sub" dir="ltr">{me.email || "—"}</p>
              </div>
              <span className={`chip ${me.email_verified ? "bg-success-t text-success" : ""}`}>
                {me.email_verified ? "تم التحقق ✓" : "غير مُحقق"}
              </span>
            </div>

            {phoneVerifyOn && (
            <div className="rounded-l border border-line bg-white p-4">
              <p className="text-sm font-medium text-ink">رقم الجوال</p>
              {phoneOk ? (
                <span className="chip mt-2 bg-success-t text-success">تم التحقق من رقم الجوال ✓</span>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PhoneField value={phoneIntl} ariaLabel="رقم الجوال" placeholder="5XXXXXXXX"
                      onChange={(v) => { setPhoneIntl(v); setOtpSent(false); setCode(""); }} />
                    <button type="button" className="btn-secondary whitespace-nowrap" disabled={otpBusy || !splitPhone(phoneIntl).number}
                      onClick={requestOtp}>إرسال رمز التحقق</button>
                  </div>
                  {otpSent && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input className="field w-40 text-center tracking-[0.5em]" maxLength={4} inputMode="numeric"
                        placeholder="● ● ● ●" value={code} aria-label="رمز التحقق"
                        onChange={(e) => setCode(digitsOnly(e.target.value))} />
                      <button type="button" className="btn-primary" disabled={otpBusy || code.length < 4}
                        onClick={verifyOtp}>تأكيد</button>
                    </div>
                  )}
                </>
              )}
              {vmsg && <p className="mt-2 text-xs text-sub">{vmsg}</p>}
            </div>
            )}
            <p className="text-xs text-sub">يمكنك تخطّي هذه الخطوة الآن وإكمالها لاحقًا من الإعدادات.</p>
          </div>
        )}

        {formError && <p className="mt-5 rounded-m bg-danger-t p-3 text-sm text-danger">{formError}</p>}
      </section>

      <footer className="sticky bottom-0 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="w-full sm:w-56"><WizardStepper steps={STEPS} current={step} percent={pct} /></div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary disabled:opacity-40"
              disabled={step === 0 || busy} onClick={() => setStep(0)}>السابق</button>
            {step === 1 && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => router.push("/dashboard")}>تخطٍّ</button>
            )}
            <button type="button" className="btn-primary disabled:opacity-50" disabled={busy} onClick={goNext}>
              {busy ? "جارٍ الحفظ…" : step === 1 ? "إكمال" : "التالي"}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}


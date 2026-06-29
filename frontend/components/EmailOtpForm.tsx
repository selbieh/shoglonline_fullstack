"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { apiError } from "@/lib/errors";

export type OtpLoginResponse = { access: string; refresh: string; first_login: boolean };

const RESEND_SECONDS = 60;
const MAX_CODE = 16; // server code is complex (letters+digits+specials); accept a sane upper bound

/**
 * Passwordless email login: enter email → receive a 6-digit code → verify.
 * Resolves to the SAME account as Google Sign-In for the same email (server-side unification),
 * so `onSuccess` receives the identical token payload the Google flow produces.
 */
export default function EmailOtpForm({
  onSuccess,
}: {
  onSuccess: (data: OtpLoginResponse) => void;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  function startCountdown() {
    setResendIn(RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1 && timer.current) clearInterval(timer.current);
        return s - 1 <= 0 ? 0 : s - 1;
      });
    }, 1000);
  }

  async function requestCode() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api("/auth/email/request-otp", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setStep("code");
      setNote("أرسلنا رمزًا إلى بريدك الإلكتروني. تحقّق من صندوق الوارد (ومجلد الرسائل غير المرغوبة).");
      startCountdown();
    } catch (e) {
      setError(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<OtpLoginResponse>("/auth/email/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), code }),
      });
      onSuccess(data);
    } catch (e) {
      setError(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      {step === "email" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) requestCode();
          }}
          className="space-y-3"
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            className="field w-full text-left"
            placeholder="example@email.com"
            aria-label="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn-primary w-full" disabled={busy || !email.trim()}>
            {busy ? "جارٍ الإرسال…" : "إرسال رمز الدخول"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 4) verifyCode();
          }}
          className="space-y-3"
        >
          <input
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            maxLength={MAX_CODE}
            className="field w-full text-center font-mono tracking-[0.4em] text-lg"
            placeholder="الرمز المكوّن من ٧ خانات"
            aria-label="رمز الدخول"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s+/g, "").slice(0, MAX_CODE))}
          />
          <p className="text-[11px] text-sub">الرمز حسّاس لحالة الأحرف — اكتبه كما ورد في البريد تمامًا.</p>
          <button type="submit" className="btn-primary w-full" disabled={busy || code.trim().length < 4}>
            {busy ? "جارٍ التحقق…" : "تأكيد ودخول"}
          </button>
          <div className="flex items-center justify-between text-xs text-sub">
            <button
              type="button"
              className="text-primary-dark disabled:opacity-40"
              disabled={busy || resendIn > 0}
              onClick={requestCode}
            >
              {resendIn > 0 ? `إعادة الإرسال خلال ${resendIn}ث` : "إعادة إرسال الرمز"}
            </button>
            <button
              type="button"
              className="text-sub hover:text-ink"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setNote(null);
              }}
            >
              تغيير البريد
            </button>
          </div>
        </form>
      )}

      {note && <p className="mt-3 text-xs text-sub">{note}</p>}
      {error && (
        <p className="mt-3 rounded-m bg-warn-t p-3 text-sm text-warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

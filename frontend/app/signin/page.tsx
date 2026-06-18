"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { LockIcon } from "@/components/icons";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type LoginResponse = {
  access: string;
  refresh: string;
  first_login: boolean;
};

/** Google SSO — the only auth method (FR-AUTH-1). */
export default function SignIn() {
  const router = useRouter();
  const gButton = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exchange(idToken: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<LoginResponse>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ id_token: idToken }),
      });
      tokens.set(data.access, data.refresh);
      router.push(data.first_login ? "/onboarding/mode" : "/dashboard");
    } catch (e) {
      const { code } = apiError(e);
      setError(
        code === "registration_closed"
          ? "🚧 التسجيل مغلق حاليًا للمستخدمين الجدد — أصحاب الحسابات الحالية يسجّلون الدخول بشكل طبيعي."
          : code === "account_frozen"
            ? "⛔ حسابك مجمّد من إدارة المنصة — تواصل مع الدعم."
            : "تعذّر تسجيل الدخول — حاول مجددًا.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return; // dev stub button is shown instead
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res: { credential: string }) => exchange(res.credential),
      });
      google.accounts.id.renderButton(gButton.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        locale: "ar",
        width: 360,
      });
    };
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-screen place-content-center bg-gradient-to-b from-bg to-tint px-4">
      <div className="card w-full max-w-md p-10 text-center">
        <h1 className="text-3xl font-extrabold text-primary">شغل أونلاين</h1>
        <h2 className="mt-4 text-xl font-bold">مرحبًا بك! سجّل الدخول أو أنشئ حسابًا</h2>
        <p className="mt-2 text-sm text-sub">
          بحساب جوجل فقط — لا حاجة لكلمة مرور أو رمز تحقق. الدخول الأول ينشئ حسابك تلقائيًا.
        </p>

        <div className="mt-6 flex justify-center">
          {GOOGLE_CLIENT_ID ? (
            <div ref={gButton} />
          ) : (
            <button
              className="btn-google w-full text-lg"
              disabled={busy}
              onClick={() => exchange("stub:dev@example.com")}
            >
              <span className="font-extrabold text-[#4285F4]">G</span>
              {busy ? "جارٍ الدخول…" : "دخول تجريبي (وضع التطوير)"}
            </button>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-m bg-warn-t p-3 text-sm text-warn" role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 text-xs text-sub">
          بالمتابعة فإنك توافق على <a className="text-primary-dark underline" href="#">الشروط والأحكام</a>{" "}
          و<a className="text-primary-dark underline" href="#">سياسة الخصوصية</a>
        </p>
        <p className="mt-3 flex items-start gap-1.5 rounded-m bg-tint p-3 text-right text-xs text-primary-dark">
          <LockIcon className="mt-0.5 shrink-0 text-[14px]" />
          <span>يتحقق خادمنا من هوية جوجل ثم يصدر جلسة آمنة خاصة بالمنصة — لا نخزّن أي كلمات مرور إطلاقًا</span>
        </p>
      </div>
    </main>
  );
}

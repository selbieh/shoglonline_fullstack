"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { nextFromUrl } from "@/lib/nav";
import { LockIcon } from "@/components/icons";
import Logo from "@/components/Logo";
import { Blobs, SigninArt } from "@/components/Brand";

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
      // Return the user to where they came from (?next=…). First-login users must pick a
      // mode first, so carry `next` through onboarding instead of dropping it.
      const next = nextFromUrl();
      router.push(
        data.first_login
          ? `/onboarding/mode${next ? `?next=${encodeURIComponent(next)}` : ""}`
          : (next ?? "/dashboard"),
      );
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
      // Size the button to the available container width (max 360) so it never
      // overflows the viewport on narrow phones — a fixed 360 forces horizontal
      // scroll and shoves the RTL card off-screen.
      const available = gButton.current?.parentElement?.clientWidth ?? 360;
      google.accounts.id.renderButton(gButton.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        locale: "ar",
        width: Math.min(360, Math.round(available)),
      });
    };
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      {/* Form panel — first in DOM so it leads on the right in RTL (matches the PDF) */}
      <section className="flex items-center justify-center bg-bg px-4 py-10">
        <div className="card w-full max-w-md p-8 text-center sm:p-10">
          <Logo href="/" className="mx-auto h-9 w-auto md:hidden" />
          <h1 className="mt-4 text-2xl font-extrabold md:mt-0">تسجيل الدخول</h1>
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
      </section>

      {/* Brand + illustration panel (periwinkle) — sits on the left in RTL */}
      <aside className="bg-hero relative hidden overflow-hidden md:block">
        <Blobs />
        <div className="relative grid h-full place-content-center p-10 text-center">
          <Logo href="/" tone="light" priority className="mx-auto h-10 w-auto" />
          <SigninArt className="mx-auto mt-10 w-full max-w-sm" />
        </div>
      </aside>
    </main>
  );
}

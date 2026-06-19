"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { nextFromUrl } from "@/lib/nav";
import { BriefcaseIcon, LightbulbIcon, UsersIcon } from "@/components/icons";

/** First-login mode selection (FR-MODE-1) — a view preference, never a wall (§3.1). */
export default function ModeSelect() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function choose(mode: "find_job" | "find_worker") {
    setBusy(true);
    await api("/auth/me/mode", { method: "PATCH", body: JSON.stringify({ mode }) });
    // first-login: send freelancers to the profile wizard, employers to the employer wizard
    const onboard = mode === "find_worker" ? "/onboarding/employer" : "/onboarding/profile";
    router.push(nextFromUrl() ?? onboard);
  }

  const card =
    "card cursor-pointer p-8 text-center transition hover:-translate-y-1 hover:border-primary";

  return (
    <main className="grid min-h-screen place-content-center bg-bg px-4">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-extrabold">أهلًا بك 👋 ماذا تريد أن تفعل اليوم؟</h1>
        <p className="mx-auto mt-3 max-w-xl text-sub">
          اختيارك يحدد شكل الواجهة فقط — حسابك واحد ويمكنك التبديل بين الوضعين في أي وقت من زر في
          أعلى الصفحة
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <button className={card} disabled={busy} onClick={() => choose("find_job")}>
            <span className="mx-auto grid h-16 w-16 place-content-center rounded-2xl bg-tint text-[30px] text-primary-dark"><BriefcaseIcon /></span>
            <h2 className="mt-3 text-2xl font-bold text-primary-dark">أبحث عن عمل</h2>
            <p className="mt-2 text-sm text-sub">
              تصفّح الوظائف، قدّم العروض، أنشئ خدماتك المميزة، واستلم أرباحك بأمان
            </p>
          </button>
          <button className={card} disabled={busy} onClick={() => choose("find_worker")}>
            <span className="mx-auto grid h-16 w-16 place-content-center rounded-2xl bg-accent-sky text-[30px] text-primary-deep"><UsersIcon /></span>
            <h2 className="mt-3 text-2xl font-bold">أوظِّف الآن</h2>
            <p className="mt-2 text-sm text-sub">
              انشر وظائف، استقبل العروض، اشترِ خدمات مميزة، وأدر عقودك ومدفوعاتك
            </p>
          </button>
        </div>
        <p className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-m bg-tint p-3 text-sm text-primary-dark">
          <LightbulbIcon className="shrink-0 text-[16px] text-star" /> كل شيء محفوظ عند التبديل: عقودك ومحفظتك ومحادثاتك تعمل في الوضعين معًا
        </p>
      </div>
    </main>
  );
}

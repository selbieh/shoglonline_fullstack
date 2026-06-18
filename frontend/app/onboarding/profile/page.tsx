"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";

type Draft = { expertise_level: string; hourly_rate: string; bio_title: string; overview: string };

const LEVELS: Record<string, string> = { entry: "مبتدئ", intermediate: "متوسط", expert: "خبير" };

export default function ProfileWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ expertise_level: "", hourly_rate: "", bio_title: "", overview: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tokens.access) router.replace("/signin");
  }, [router]);

  const steps = [
    {
      title: "ما مستوى خبرتك؟",
      body: (
        <div className="flex flex-wrap gap-2">
          {Object.entries(LEVELS).map(([v, l]) => (
            <button key={v}
              className={`rounded-full px-4 py-2 text-sm ${draft.expertise_level === v ? "bg-primary text-white" : "bg-tint text-sub"}`}
              onClick={() => setDraft({ ...draft, expertise_level: v })}>{l}</button>
          ))}
        </div>
      ),
    },
    {
      title: "ما سعر ساعتك؟ ($)",
      body: (
        <input className="w-full rounded-m border border-line-strong px-3 py-2" value={draft.hourly_rate}
          aria-label="سعر الساعة" onChange={(e) => setDraft({ ...draft, hourly_rate: e.target.value })} />
      ),
    },
    {
      title: "عرّف بنفسك",
      body: (
        <div className="space-y-3">
          <input className="w-full rounded-m border border-line-strong px-3 py-2" placeholder="المسمى المهني"
            aria-label="المسمى المهني" value={draft.bio_title} onChange={(e) => setDraft({ ...draft, bio_title: e.target.value })} />
          <textarea className="min-h-24 w-full rounded-m border border-line-strong px-3 py-2" placeholder="نبذة مختصرة"
            aria-label="نبذة" value={draft.overview} onChange={(e) => setDraft({ ...draft, overview: e.target.value })} />
        </div>
      ),
    },
  ];

  const pct = Math.round(((step + 1) / steps.length) * 100);
  const last = step === steps.length - 1;

  async function finish() {
    setBusy(true);
    setMsg("");
    try {
      await api("/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          expertise_level: draft.expertise_level || "",
          hourly_rate: draft.hourly_rate || null,
          bio_title: draft.bio_title,
          overview: draft.overview,
        }),
      });
      router.push("/me/profile");
    } catch (e) {
      setMsg(apiError(e).message_ar);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-content-center px-6">
      <div className="w-full">
        <div className="h-2 w-full rounded-full bg-tint">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} aria-label="تقدّم الإعداد" />
        </div>
        <p className="mt-1 text-xs text-sub">خطوة {step + 1} من {steps.length}</p>

        <h1 className="mt-6 text-2xl font-extrabold">{steps[step].title}</h1>
        <div className="mt-4">{steps[step].body}</div>

        {msg && <p className="mt-4 rounded-m bg-warn-t p-3 text-sm text-warn">{msg}</p>}

        <div className="mt-8 flex items-center justify-between">
          <button className="text-sm text-sub disabled:opacity-40" disabled={step === 0} onClick={() => setStep(step - 1)}>
            رجوع
          </button>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => (last ? finish() : setStep(step + 1))}>تخطٍّ</button>
            {last ? (
              <button className="btn-primary" disabled={busy} onClick={finish}>{busy ? "جارٍ الحفظ…" : "إنهاء"}</button>
            ) : (
              <button className="btn-primary" onClick={() => setStep(step + 1)}>التالي</button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

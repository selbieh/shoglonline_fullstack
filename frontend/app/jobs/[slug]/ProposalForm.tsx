"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { bidsEnabled, fetchPublicSettings } from "@/lib/settings";
import type { Job } from "@/lib/types";
import { TicketIcon } from "@/components/icons";

/** Interactive proposal form (client island) — the surrounding job content is SSR. */
export default function ProposalForm({ job }: { job: Job }) {
  const router = useRouter();
  const [bids, setBids] = useState<number | null>(null);
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState("14");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [bidsOn, setBidsOn] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(tokens.access));
    fetchPublicSettings().then((s) => {
      const on = bidsEnabled(s);
      setBidsOn(on);
      // only fetch/show the bid balance while the bid economy is on
      if (on && tokens.access) {
        api<{ balance: number }>("/me/bids").then((b) => setBids(b.balance)).catch(() => undefined);
      }
    });
  }, []);

  async function submit() {
    if (!tokens.access) return router.push("/signin");
    setBusy(true);
    setMsg(null);
    try {
      await api(`/jobs/${job.id}/proposals`, {
        method: "POST",
        body: JSON.stringify({ budget, delivery_days: Number(days), description, answers }),
      });
      setSubmitted(true);
    } catch (e) {
      const raw = JSON.stringify((e as { body?: unknown }).body ?? {});
      const outOfBids = raw.includes("insufficient_bids");
      setMsg({
        ok: false,
        href: outOfBids ? "/bids" : undefined,
        text: raw.includes("self_dealing")
          ? "⚠️ لا يمكنك التقديم على وظيفتك الخاصة"
          : outOfBids
            ? "⚠️ رصيد العروض غير كافٍ — اشترِ باقة"
            : raw.includes("screening_required")
              ? "⚠️ أجب عن جميع الأسئلة الإلزامية (*)"
              : raw.includes("duplicate")
                ? "⚠️ قدّمت عرضًا على هذه الوظيفة من قبل"
                : "تعذّر إرسال العرض — تحقق من الحقول",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <div className="rounded-m bg-tint p-4 text-center text-sm">
        <p className="font-bold text-primary-deep">سجّل الدخول لتقديم عرض</p>
        <p className="mt-1 text-sub">تصفّح الوظيفة بحرية — التقديم يتطلّب دخولًا عبر جوجل.</p>
        <a href="/signin" className="btn-primary mt-3 inline-block">دخول عبر جوجل</a>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-m bg-success-t p-5 text-center text-sm">
        <p className="text-2xl" aria-hidden>✅</p>
        <p className="mt-2 font-bold text-success">تم إرسال عرضك بنجاح</p>
        <p className="mt-1 text-primary-dark">
          {bidsOn
            ? "خُصم عرض واحد من رصيدك. يمكنك متابعة حالة العرض وإلغاؤه ما لم يُشاهد من صفحة عروضي."
            : "يمكنك متابعة حالة العرض وإلغاؤه ما لم يُشاهد من صفحة عروضي."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <a href="/me/proposals" className="btn-primary">عرض عروضي</a>
          <a href="/jobs" className="btn-secondary">تصفّح وظائف أخرى</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bidsOn && bids !== null && (
        <div className="flex items-center justify-between rounded-m bg-tint px-3 py-2 text-sm text-primary-dark">
          <span className="inline-flex items-center gap-1.5"><TicketIcon className="text-[15px]" /> سيُخصم عرض واحد · رصيدك: <b>{bids}</b></span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-bold">
          قيمة العرض (د.ك) *
          <input className="mt-1 w-full rounded-m border border-line-strong px-3 py-2"
            value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <label className="text-sm font-bold">
          مدة التسليم (أيام) *
          <input className="mt-1 w-full rounded-m border border-line-strong px-3 py-2"
            value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm font-bold">
        تفاصيل العرض *
        <textarea className="mt-1 min-h-24 w-full rounded-m border border-line-strong px-3 py-2"
          placeholder="اشرح كيف ستنفّذ المشروع وما يميز عرضك…"
          value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      {(job.screening_questions?.length ?? 0) > 0 && (
        <div className="space-y-3 rounded-m bg-bg p-3">
          <p className="text-sm font-bold">أسئلة صاحب العمل</p>
          {job.screening_questions!.map((sq) => (
            <label key={sq.id} className="block text-sm">
              {sq.question} {sq.is_required && <span className="text-danger">*</span>}
              <input className="mt-1 w-full rounded-s border border-line px-3 py-1.5"
                value={answers[sq.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [sq.id]: e.target.value })} />
            </label>
          ))}
        </div>
      )}

      <button className="btn-primary w-full py-3" disabled={busy} onClick={submit}>
        {busy ? "جارٍ الإرسال…" : bidsOn ? "إرسال العرض (يُخصم ١ من رصيدك)" : "إرسال العرض"}
      </button>
      {msg && (
        <p className={`rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>
          {msg.text}
          {msg.href && (
            <a href={msg.href} className="mr-1 font-bold underline">اشترِ باقة عروض ←</a>
          )}
        </p>
      )}
      <p className="text-xs text-sub">
        يمكنك تعديل عرضك حتى يُقبل، وإلغاؤه ما لم يُشاهد
        {bidsOn && " · إن أُغلقت الوظيفة قبل البتّ يُسترد رصيدك تلقائيًا"}
      </p>
    </div>
  );
}

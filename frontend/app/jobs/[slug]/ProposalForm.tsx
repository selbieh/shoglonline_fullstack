"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { bidsEnabled, fetchPublicSettings } from "@/lib/settings";
import type { Job } from "@/lib/types";
import ContactHint from "@/components/ContactHint";
import { TicketIcon, ClockIcon, SendIcon, CheckIcon } from "@/components/icons";

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
    if (!tokens.access) return router.push(signinHereHref());
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
      <div className="rounded-m border border-line bg-tint/60 p-5 text-center text-sm">
        <span className="mx-auto mb-3 grid h-11 w-11 place-content-center rounded-full bg-white text-primary shadow-sm">
          <SendIcon className="text-[18px]" />
        </span>
        <p className="font-bold text-primary-deep">سجّل الدخول لتقديم عرض</p>
        <p className="mt-1 text-sub">تصفّح الوظيفة بحرية — التقديم يتطلّب دخولًا عبر جوجل.</p>
        <button type="button" onClick={() => router.push(signinHereHref())} className="btn-primary mt-4 w-full">دخول عبر جوجل</button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-m border border-success/20 bg-success-t p-6 text-center text-sm">
        <span className="mx-auto mb-3 grid h-12 w-12 place-content-center rounded-full bg-success text-white">
          <CheckIcon className="text-[22px]" />
        </span>
        <p className="text-base font-bold text-success">تم إرسال عرضك بنجاح</p>
        <p className="mt-1.5 leading-6 text-primary-dark">
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
        <div className="flex items-center justify-between gap-2 rounded-m border border-primary/15 bg-tint px-4 py-2.5 text-sm text-primary-dark">
          <span className="inline-flex items-center gap-1.5"><TicketIcon className="text-[15px]" /> سيُخصم عرض واحد عند الإرسال</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-primary-deep">رصيدك: {bids}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="field-label">قيمة العرض <span className="text-danger">*</span></span>
          <span className="relative block">
            <input className="field pl-12" inputMode="decimal" placeholder="0"
              value={budget} onChange={(e) => setBudget(e.target.value)} />
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-medium text-sub">$</span>
          </span>
          <span className="mt-1 block text-xs text-sub">الميزانية: ${job.budget_min}–${job.budget_max}</span>
        </label>
        <label>
          <span className="field-label">مدة التسليم <span className="text-danger">*</span></span>
          <span className="relative block">
            <input className="field pl-12" inputMode="numeric"
              value={days} onChange={(e) => setDays(e.target.value)} />
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-medium text-sub">يوم</span>
          </span>
          <span className="mt-1 block text-xs text-sub">المدة المقدّرة للإنجاز</span>
        </label>
      </div>
      <label className="block">
        <span className="field-label">تفاصيل العرض <span className="text-danger">*</span></span>
        <textarea className="field field-area"
          placeholder="اشرح كيف ستنفّذ المشروع وما يميز عرضك…"
          value={description} onChange={(e) => setDescription(e.target.value)} />
        <ContactHint text={description} />
      </label>

      {(job.screening_questions?.length ?? 0) > 0 && (
        <div className="space-y-3 rounded-m border border-line bg-bg p-4">
          <p className="text-sm font-bold text-ink">أسئلة صاحب العمل</p>
          {job.screening_questions!.map((sq) => (
            <label key={sq.id} className="block text-sm">
              <span className="mb-1 block font-medium text-ink">{sq.question} {sq.is_required && <span className="text-danger">*</span>}</span>
              <input className="field"
                value={answers[sq.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [sq.id]: e.target.value })} />
            </label>
          ))}
        </div>
      )}

      <button className="btn-gradient btn-lg w-full" disabled={busy} onClick={submit}>
        {busy ? "جارٍ الإرسال…" : (
          <span className="inline-flex items-center gap-2">
            <SendIcon className="text-[16px]" />
            {bidsOn ? "إرسال العرض (يُخصم ١ من رصيدك)" : "إرسال العرض"}
          </span>
        )}
      </button>
      {msg && (
        <p className={`rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>
          {msg.text}
          {msg.href && (
            <a href={msg.href} className="mr-1 font-bold underline">اشترِ باقة عروض ←</a>
          )}
        </p>
      )}
      <p className="flex items-start gap-1.5 text-xs leading-5 text-sub">
        <ClockIcon className="mt-0.5 shrink-0 text-[13px]" />
        <span>
          يمكنك تعديل عرضك حتى يُقبل، وإلغاؤه ما لم يُشاهد
          {bidsOn && " · إن أُغلقت الوظيفة قبل البتّ يُسترد رصيدك تلقائيًا"}
        </span>
      </p>
    </div>
  );
}

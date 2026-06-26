"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { bidsEnabled, fetchPublicSettings } from "@/lib/settings";
import { apiError } from "@/lib/errors";
import { useFieldErrors, validateFields } from "@/lib/useFieldErrors";
import { digitsOnly, toAsciiDigits } from "@/lib/arabic";
import type { Job } from "@/lib/types";
import Field from "@/components/Field";
import ContactHint from "@/components/ContactHint";
import { TicketIcon, ClockIcon, SendIcon, CheckIcon } from "@/components/icons";
import { formatUSDRange } from "@/lib/currency";

/** Interactive proposal form (client island) — the surrounding job content is SSR. */
export default function ProposalForm({ job }: { job: Job }) {
  const router = useRouter();
  const [bids, setBids] = useState<number | null>(null);
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState("14");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { errors, setErrors, clearFields, formError, setFormError, applyApiError } = useFieldErrors();
  // The one global error that carries a call-to-action link (buy a bid package).
  const [buyBidsHref, setBuyBidsHref] = useState<string | null>(null);
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

  /** Client-side per-field rules (keyed by the same names the API uses, so messages line up). */
  function clientErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    const b = Number(toAsciiDigits(budget).replace(/[^\d.]/g, ""));
    if (!budget.trim()) e.budget = "أدخل قيمة العرض";
    else if (!(b > 0)) e.budget = "أدخل قيمة أكبر من صفر";
    if (!(Number(days) >= 1)) e.delivery_days = "أدخل مدة تسليم لا تقل عن يوم";
    if (!description.trim()) e.description = "اكتب تفاصيل عرضك";
    // required screening questions are keyed by their id (client-side only — the API reports these globally)
    for (const sq of job.screening_questions ?? []) {
      if (sq.is_required && !(answers[sq.id] ?? "").trim()) e[`q_${sq.id}`] = "هذا السؤال إلزامي";
    }
    return e;
  }

  async function submit() {
    if (!tokens.access) return router.push(signinHereHref());
    setFormError("");
    setBuyBidsHref(null);
    const found = clientErrors();
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
      return;
    }
    setBusy(true);
    try {
      await api(`/jobs/${job.id}/proposals`, {
        method: "POST",
        body: JSON.stringify({ budget, delivery_days: Number(days), description, answers }),
      });
      setSubmitted(true);
    } catch (e) {
      // Field-keyed API errors (budget / delivery_days / description) land on the inputs;
      // domain errors (self-dealing, duplicate, out-of-bids, screening) fall back to the banner.
      const keys = applyApiError(e);
      if (!keys.length && apiError(e).code === "insufficient_bids") setBuyBidsHref("/bids");
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
        <Field label="قيمة العرض (بالدولار الأمريكي)" required error={errors.budget}
          hint={`الميزانية: ${formatUSDRange(job.budget_min, job.budget_max)}`}>
          <input className="field" inputMode="decimal" placeholder="0"
            value={budget}
            onChange={(e) => { setBudget(toAsciiDigits(e.target.value).replace(/[^\d.]/g, "")); clearFields("budget"); }} />
        </Field>
        <Field label="مدة التسليم" required error={errors.delivery_days} hint="المدة المقدّرة للإنجاز">
          <span className="relative block">
            <input className="field pl-12" inputMode="numeric"
              value={days} onChange={(e) => { setDays(digitsOnly(e.target.value)); clearFields("delivery_days"); }} />
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-medium text-sub">يوم</span>
          </span>
        </Field>
      </div>
      <Field label="تفاصيل العرض" required error={errors.description}>
        <textarea className="field field-area"
          placeholder="اشرح كيف ستنفّذ المشروع وما يميز عرضك…"
          value={description} onChange={(e) => { setDescription(e.target.value); clearFields("description"); }} />
        <ContactHint text={description} />
      </Field>

      {(job.screening_questions?.length ?? 0) > 0 && (
        <div className="space-y-3 rounded-m border border-line bg-bg p-4">
          <p className="text-sm font-bold text-ink">أسئلة صاحب العمل</p>
          {job.screening_questions!.map((sq) => (
            <Field key={sq.id} label={sq.question} required={sq.is_required} error={errors[`q_${sq.id}`]}>
              <input className="field"
                value={answers[sq.id] ?? ""}
                onChange={(e) => { setAnswers({ ...answers, [sq.id]: e.target.value }); clearFields(`q_${sq.id}`); }} />
            </Field>
          ))}
        </div>
      )}

      <button className="btn-gradient btn-lg w-full" disabled={busy} onClick={submit}>
        {busy ? "جارٍ الإرسال…" : (
          <span className="inline-flex items-center gap-2">
            <SendIcon className="text-[16px]" />
            {bidsOn ? "إرسال العرض (يُخصم 1 من رصيدك)" : "إرسال العرض"}
          </span>
        )}
      </button>
      {formError && (
        <p className="rounded-m bg-warn-t p-3 text-sm text-warn">
          ⚠️ {formError}
          {buyBidsHref && (
            <a href={buyBidsHref} className="mr-1 font-bold underline">اشترِ باقة عروض ←</a>
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens, type Me } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { bidsEnabled, fetchPublicSettings } from "@/lib/settings";
import { apiError } from "@/lib/errors";
import { useFieldErrors, validateFields } from "@/lib/useFieldErrors";
import { digitsOnly, toAsciiDigits } from "@/lib/arabic";
import { timeAgo } from "@/lib/format";
import {
  PROPOSAL_STATUS_LABEL,
  type Job,
  type Paginated,
  type Proposal,
} from "@/lib/types";
import Field from "@/components/Field";
import ContactHint from "@/components/ContactHint";
import { TicketIcon, ClockIcon, SendIcon, CheckIcon, ClipboardIcon } from "@/components/icons";
import { formatUSD, formatUSDRange } from "@/lib/currency";

/** Soft badge tone per proposal status — mirrors the «عروضي» list page. */
const STATUS_TONE: Record<string, string> = {
  pending_approval: "bg-warn-t text-warn",
  submitted: "bg-tint text-primary-dark",
  viewed: "bg-accent-sky text-primary-deep",
  accepted: "bg-success-t text-success",
  rejected: "bg-danger-t text-danger",
  cancelled: "bg-line/50 text-sub",
  withdrawn: "bg-line/50 text-sub",
};

/** Interactive proposal form (client island) — the surrounding job content is SSR. */
export default function ProposalForm({ job }: { job: Job }) {
  const router = useRouter();
  // An invited worker applies for free (BR-7) — suppress every bid-cost hint for them.
  const invited = Boolean(job.viewer_invited);
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
  // True once we confirm the signed-in user owns this job — an owner can't bid on their own job
  // (backend BR-21 self_dealing), so we show a "manage your job" notice instead of the form.
  const [isOwner, setIsOwner] = useState(false);
  // Gates the form until the ownership check settles, so an owner never sees a flash of the bid
  // form before /auth/me resolves (the /me/proposals lookup can return first).
  const [ownerChecked, setOwnerChecked] = useState(false);
  // The worker's prior proposal on this job, if any (undefined = still checking, null = none).
  // A worker may bid only once per job (backend uniq_proposal_per_job_worker), so when one
  // exists we show it read-only instead of the form.
  const [existing, setExisting] = useState<Proposal | null | undefined>(undefined);

  useEffect(() => {
    const isAuthed = Boolean(tokens.access);
    setAuthed(isAuthed);
    if (!isAuthed) {
      setExisting(null);
      return;
    }
    // Owner short-circuit: a job owner may never bid on their own job (BR-21). The SSR job is fetched
    // anonymously, so ownership can only be resolved here, client-side, against the signed-in user.
    if (job.employer != null) {
      api<Me>("/auth/me")
        .then((me) => {
          if (me.id === job.employer) {
            setIsOwner(true);
            setExisting(null);
          }
        })
        .catch(() => undefined)
        .finally(() => setOwnerChecked(true));
    } else {
      setOwnerChecked(true);  // nothing to compare against — never an owner
    }
    fetchPublicSettings().then((s) => {
      const on = bidsEnabled(s);
      setBidsOn(on);
      // only fetch/show the bid balance while the bid economy is on
      if (on) {
        api<{ balance: number }>("/me/bids").then((b) => setBids(b.balance)).catch(() => undefined);
      }
    });
    api<Paginated<Proposal>>(`/me/proposals?job=${job.id}`)
      .then((r) => setExisting(r.results[0] ?? null))
      .catch(() => setExisting(null));
  }, [job.id]);

  /** Client-side per-field rules (keyed by the same names the API uses, so messages line up). */
  function clientErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    const raw = toAsciiDigits(budget).replace(/[^\d.]/g, "");
    const b = Number(raw);
    const min = Number(job.budget_min);
    const max = Number(job.budget_max);
    if (!budget.trim()) e.budget = "أدخل قيمة العرض";
    else if (!(b > 0)) e.budget = "أدخل قيمة أكبر من صفر";
    else if (!/^\d+(\.\d{1,2})?$/.test(raw)) e.budget = "أدخل قيمة بحد أقصى منزلتين عشريتين";
    else if (b < min || b > max) e.budget = `قيمة العرض يجب أن تكون ضمن الميزانية: ${formatUSDRange(job.budget_min, job.budget_max)}`;
    const d = Number(days);
    if (!(d >= 1)) e.delivery_days = "أدخل مدة تسليم لا تقل عن يوم";
    else if (d > 365) e.delivery_days = "أقصى مدة تسليم 365 يومًا";
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
      // domain errors (self-dealing, duplicate, out-of-bids) fall back to the banner.
      const keys = applyApiError(e);
      // screening_required carries the unanswered question pks — map them onto the per-question inputs.
      const missing = (e as { body?: { missing_questions?: number[] } } | undefined)?.body?.missing_questions;
      if (Array.isArray(missing) && missing.length) {
        setErrors(Object.fromEntries(missing.map((pk) => [`q_${pk}`, "هذا السؤال إلزامي"])));
        setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
      } else if (!keys.length && apiError(e).code === "insufficient_bids") setBuyBidsHref("/bids");
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

  // You own this job — you can't bid on it (BR-21). Point yourself at your proposals inbox instead.
  if (isOwner) {
    return (
      <div className="rounded-m border border-line bg-tint/60 p-5 text-center text-sm">
        <span className="mx-auto mb-3 grid h-11 w-11 place-content-center rounded-full bg-white text-primary shadow-sm">
          <ClipboardIcon className="text-[18px]" />
        </span>
        <p className="font-bold text-primary-deep">هذه وظيفتك</p>
        <p className="mt-1 text-sub">لا يمكنك التقديم على وظيفة نشرتها بنفسك. تابِع العروض الواردة وأدِر وظيفتك من لوحة التحكم.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <a href={`/me/jobs/${job.id}/proposals`} className="btn-primary">العروض الواردة</a>
          <a href="/me/jobs" className="btn-secondary">وظائفي</a>
        </div>
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
          {invited
            ? "بصفتك مدعوًّا لهذه الوظيفة، لم يُخصم أي رصيد. يمكنك متابعة حالة العرض من صفحة عروضي."
            : bidsOn
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

  // Still checking whether the worker already applied or owns this job — avoid flashing a form
  // we're about to replace with the "already applied" / "your job" notices.
  if (existing === undefined || !ownerChecked) {
    return (
      <div className="rounded-m border border-line bg-tint/40 p-5">
        <div className="h-5 w-2/3 animate-pulse rounded bg-line" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-line" />
        <div className="mt-4 h-10 w-full animate-pulse rounded bg-line" />
      </div>
    );
  }

  // Already applied — show the existing offer (details + status) instead of letting them re-apply.
  if (existing) {
    return (
      <div className="rounded-m border border-line bg-tint/40 p-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 font-bold text-primary-deep">
            <CheckIcon className="text-[16px] text-success" /> قدّمت عرضًا على هذه الوظيفة من قبل
          </p>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[existing.status] ?? "bg-tint text-primary-dark"}`}>
            {PROPOSAL_STATUS_LABEL[existing.status] ?? existing.status}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-m bg-white p-3">
            <dt className="text-xs text-sub">قيمة العرض</dt>
            <dd className="mt-0.5 font-bold text-ink">{formatUSD(existing.budget)}</dd>
          </div>
          <div className="rounded-m bg-white p-3">
            <dt className="text-xs text-sub">مدة التسليم</dt>
            <dd className="mt-0.5 font-bold text-ink">{existing.delivery_days.toLocaleString("en-US")} يوم</dd>
          </div>
        </dl>

        {existing.description && (
          <div className="mt-3">
            <p className="text-xs text-sub">تفاصيل العرض</p>
            <p className="mt-1 whitespace-pre-wrap leading-6 text-primary-dark">{existing.description}</p>
          </div>
        )}

        {existing.reject_reason && (
          <p className="mt-3 rounded-m bg-warn-t p-2.5 text-xs text-warn">سبب الرفض: {existing.reject_reason}</p>
        )}

        {timeAgo(existing.created_at) && (
          <p className="mt-3 text-xs text-sub">قُدّم {timeAgo(existing.created_at)}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/me/proposals" className="btn-primary">إدارة عروضي</a>
          <a href="/jobs" className="btn-secondary">تصفّح وظائف أخرى</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {invited && (
        <div className="flex items-center gap-2 rounded-m border border-success/20 bg-success-t px-4 py-2.5 text-sm text-success">
          <CheckIcon className="text-[15px]" />
          <span>دُعيت لهذه الوظيفة — تقديم عرضك <span className="font-bold">مجاني</span> ولن يُخصم أي رصيد.</span>
        </div>
      )}
      {!invited && bidsOn && bids !== null && (
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
            <input className="field pe-12" inputMode="numeric"
              value={days} onChange={(e) => { setDays(digitsOnly(e.target.value)); clearFields("delivery_days"); }} />
            <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-sm font-medium text-sub">يوم</span>
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
            {!invited && bidsOn ? "إرسال العرض (يُخصم 1 من رصيدك)" : "إرسال العرض"}
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
          {!invited && bidsOn && " · إن أُغلقت الوظيفة قبل البتّ يُسترد رصيدك تلقائيًا"}
        </span>
      </p>
    </div>
  );
}

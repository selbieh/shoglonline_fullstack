"use client";

import PageLoader from "@/components/PageLoader";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { formatUSD } from "@/lib/currency";
import { PROPOSAL_STATUS_LABEL, type Job } from "@/lib/types";
import { StarIcon } from "@/components/icons";

/** Employer view of a single proposal (adds worker id + the private rating). */
type EmployerProposal = {
  id: number;
  job: number;
  job_title: string;
  job_slug: string;
  worker: number;
  worker_name: string;
  budget: string;
  delivery_days: number;
  description: string;
  status: string;
  reject_reason: string;
  created_at: string;
  employer_private_rating: number | null;
};

/** Soft badge tone per proposal status — mirrors the «عروضي» palette. */
const STATUS_TONE: Record<string, string> = {
  submitted: "bg-tint text-primary-dark",
  viewed: "bg-accent-sky text-primary-deep",
  accepted: "bg-success-t text-success",
  rejected: "bg-danger-t text-danger",
  cancelled: "bg-line/50 text-sub",
  withdrawn: "bg-line/50 text-sub",
};

/** Statuses where the employer can still accept/reject the offer. */
const ACTIONABLE = ["submitted", "viewed"];

/** Private 1–5 star picker (BR-8: only ever shown to the employer). */
function RatingStars({ value, busy, onPick }: { value: number; busy: boolean; onPick: (n: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={busy}
          aria-label={`${n} نجوم`}
          onClick={() => onPick(n)}
          className="p-0.5 transition hover:scale-110 disabled:opacity-50"
        >
          <StarIcon filled={n <= value} className={`text-[18px] ${n <= value ? "text-star" : "text-line"}`} />
        </button>
      ))}
    </span>
  );
}

export default function JobProposalsPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = String(params.id);

  const [job, setJob] = useState<Job | null>(null);
  const [proposals, setProposals] = useState<EmployerProposal[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    const [j, p] = await Promise.all([
      api<Job>(`/me/jobs/${jobId}`),
      api<{ results: EmployerProposal[] }>(`/me/jobs/${jobId}/proposals`),
    ]);
    setJob(j);
    setProposals(p.results);
  }, [jobId]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load().catch(() => setErr(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function patch(id: number, fields: Partial<EmployerProposal>) {
    setProposals((list) => list?.map((p) => (p.id === id ? { ...p, ...fields } : p)) ?? null);
  }

  async function accept(p: EmployerProposal) {
    if (!confirm(`قبول عرض ${p.worker_name}؟ سيُنشأ عقد وتُرفض بقية العروض تلقائيًا.`)) return;
    setBusyId(p.id);
    setMsg(null);
    try {
      const res = await api<{ status: string; contract?: { id: number } }>(`/proposals/${p.id}/accept`, { method: "POST" });
      patch(p.id, { status: res.status });
      setMsg({ ok: true, text: "✅ قُبل العرض وأُنشئ العقد" });
      if (res.contract?.id) router.push(`/contracts/${res.contract.id}`);
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject(p: EmployerProposal) {
    if (!reason.trim()) {
      setMsg({ ok: false, text: "يرجى كتابة سبب الرفض" });
      return;
    }
    setBusyId(p.id);
    setMsg(null);
    try {
      await api(`/proposals/${p.id}/reject`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      patch(p.id, { status: "rejected", reject_reason: reason.trim() });
      setRejectId(null);
      setReason("");
      setMsg({ ok: true, text: "تم رفض العرض" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusyId(null);
    }
  }

  async function rate(p: EmployerProposal, rating: number) {
    setBusyId(p.id);
    try {
      await api(`/proposals/${p.id}/rate`, { method: "POST", body: JSON.stringify({ rating }) });
      patch(p.id, { employer_private_rating: rating });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusyId(null);
    }
  }

  function retry() {
    setErr(false);
    setProposals(null);
    load().catch(() => setErr(true));
  }

  if (err) return (
    <main className="grid min-h-screen place-content-center gap-3 text-center text-sub">
      <p>تعذّر تحميل العروض.</p>
      <button type="button" onClick={retry} className="font-bold text-primary-dark underline">إعادة المحاولة</button>
    </main>
  );
  if (!proposals) return <PageLoader />;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold sm:text-3xl">العروض المستلمة</h1>
          {job && <p className="mt-1 truncate text-sm text-sub">على وظيفة «{job.title}» · {proposals.length} عرض</p>}
        </div>
        <a href="/me/jobs" className="text-sm text-primary-dark">← وظائفي</a>
      </div>

      {msg && (
        <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`} role="status">
          {msg.text}
        </p>
      )}

      {proposals.length === 0 ? (
        <div className="card mt-6 py-14 text-center text-sub">
          <p className="font-bold">لا توجد عروض بعد</p>
          <p className="mt-1 text-sm">سنُعلِمك فور وصول عرض جديد على هذه الوظيفة.</p>
          {job && <a href={`/jobs/${job.slug}`} className="btn-secondary mt-4 inline-block text-sm">عرض الوظيفة</a>}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {proposals.map((p) => (
            <li key={p.id} className="card-modern p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={`/freelancers/${p.worker}`} className="font-bold leading-snug transition hover:text-primary-dark">
                    {p.worker_name}
                  </a>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
                    <span className="font-bold text-ink">{formatUSD(p.budget)}</span>
                    <span>التسليم خلال {p.delivery_days.toLocaleString("en-US")} يوم</span>
                    {timeAgo(p.created_at) && <span>{timeAgo(p.created_at)}</span>}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[p.status] ?? "bg-tint text-primary-dark"}`}>
                  {PROPOSAL_STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>

              {p.description && <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink/90">{p.description}</p>}

              {p.reject_reason && (
                <p className="mt-3 rounded-m bg-warn-t p-2.5 text-xs text-warn">سبب الرفض: {p.reject_reason}</p>
              )}

              {/* private rating — visible only to you (BR-8) */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3">
                <span className="flex items-center gap-2 text-xs text-sub">
                  تقييمك الخاص:
                  <RatingStars value={p.employer_private_rating ?? 0} busy={busyId === p.id} onPick={(n) => rate(p, n)} />
                </span>

                {ACTIONABLE.includes(p.status) && (
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm" disabled={busyId === p.id} onClick={() => accept(p)}>قبول</button>
                    <button className="btn-secondary text-sm" disabled={busyId === p.id}
                      onClick={() => { setRejectId(rejectId === p.id ? null : p.id); setReason(""); }}>رفض</button>
                  </div>
                )}
              </div>

              {rejectId === p.id && (
                <div className="mt-3 space-y-2 rounded-m bg-bg p-3">
                  <textarea className="field w-full" rows={2} placeholder="سبب الرفض (يظهر للمستقل)"
                    aria-label="سبب الرفض" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm" disabled={busyId === p.id} onClick={() => submitReject(p)}>تأكيد الرفض</button>
                    <button className="btn-secondary text-sm" onClick={() => setRejectId(null)}>إلغاء</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

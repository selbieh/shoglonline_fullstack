"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import {
  PROPOSAL_CANCELLABLE,
  PROPOSAL_STATUS_LABEL,
  type Paginated,
  type Proposal,
} from "@/lib/types";

/** Soft badge tone per proposal status — mirrors the status palette used across the app. */
const STATUS_TONE: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-700",
  submitted: "bg-sky-100 text-sky-700",
  viewed: "bg-indigo-100 text-indigo-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-600",
  withdrawn: "bg-slate-100 text-slate-600",
};

/** Filter tabs: "all" + every known status, in workflow order. */
const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "الكل" },
  ...Object.keys(PROPOSAL_STATUS_LABEL).map((value) => ({ value, label: PROPOSAL_STATUS_LABEL[value] })),
];

export default function MyProposalsPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (s: string) => {
    setProposals(null);
    const res = await api<Paginated<Proposal>>(`/me/proposals${s ? `?status=${s}` : ""}`);
    setProposals(res.results);
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    load(status).catch(() => router.replace("/signin"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function cancel(p: Proposal) {
    if (!confirm("هل تريد إلغاء هذا العرض؟ لا يمكن التراجع.")) return;
    setBusyId(p.id);
    setMsg(null);
    try {
      await api(`/proposals/${p.id}/cancel`, { method: "POST" });
      setProposals((list) => list?.map((x) => (x.id === p.id ? { ...x, status: "cancelled" } : x)) ?? null);
      setMsg({ ok: true, text: "✅ أُلغي العرض" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">عروضي المقدّمة</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>
      <p className="mt-1 text-sm text-sub">
        تابع حالة العروض التي قدّمتها على الوظائف. يمكنك إلغاء العرض ما لم يُشاهده صاحب العمل.
      </p>

      {/* status filter tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => setStatus(f.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${
              status === f.value ? "bg-primary text-white" : "bg-tint text-primary-dark hover:bg-primary/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`} role="status">
          {msg.text}
        </p>
      )}

      {proposals === null ? (
        <ul className="mt-6 space-y-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="card-modern animate-pulse p-5">
              <div className="h-5 w-2/3 rounded bg-line" />
              <div className="mt-3 h-4 w-1/3 rounded bg-line" />
            </li>
          ))}
        </ul>
      ) : proposals.length === 0 ? (
        <div className="card mt-6 py-14 text-center text-sub">
          <p className="font-bold">لا توجد عروض {status && `بحالة «${PROPOSAL_STATUS_LABEL[status]}»`}</p>
          <p className="mt-1 text-sm">تصفّح الوظائف وقدّم أول عرض لك</p>
          <a href="/jobs" className="btn-secondary mt-4 inline-block text-sm">تصفّح الوظائف</a>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {proposals.map((p) => (
            <li key={p.id} className="card-modern p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={`/jobs/${p.job_slug}`} className="font-bold leading-snug transition hover:text-primary-dark">
                    {p.job_title}
                  </a>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
                    <span className="font-bold text-ink" dir="ltr">{p.budget} د.ك</span>
                    <span>التسليم خلال {p.delivery_days.toLocaleString("ar-EG")} يوم</span>
                    {timeAgo(p.created_at) && <span>{timeAgo(p.created_at)}</span>}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[p.status] ?? "bg-tint text-primary-dark"}`}>
                  {PROPOSAL_STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>

              {p.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-sub">{p.description}</p>}

              {p.reject_reason && (
                <p className="mt-3 rounded-m bg-warn-t p-2.5 text-xs text-warn">سبب الرفض: {p.reject_reason}</p>
              )}

              {PROPOSAL_CANCELLABLE.includes(p.status) && (
                <div className="mt-4 flex justify-end border-t border-line/70 pt-3">
                  <button
                    type="button"
                    className="text-sm text-danger hover:underline disabled:opacity-50"
                    disabled={busyId === p.id}
                    onClick={() => cancel(p)}
                  >
                    {busyId === p.id ? "جارٍ الإلغاء…" : "إلغاء العرض"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import {
  PROPOSAL_CANCELLABLE,
  PROPOSAL_STATUS_LABEL,
  type Paginated,
  type Proposal,
} from "@/lib/types";
import StatusTabs from "@/components/StatusTabs";
import RowActionMenu, { type RowAction } from "@/components/RowActionMenu";
import DashboardShell from "@/components/DashboardShell";

/** Soft badge tone per proposal status — mirrors the status palette used across the app. */
const STATUS_TONE: Record<string, string> = {
  pending_approval: "bg-warn-t text-warn",
  submitted: "bg-tint text-primary-dark",
  viewed: "bg-accent-sky text-primary-deep",
  accepted: "bg-success-t text-success",
  rejected: "bg-danger-t text-danger",
  cancelled: "bg-line/50 text-sub",
  withdrawn: "bg-line/50 text-sub",
};

/** Filter tabs: "all" + every known status, in workflow order. */
const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "الكل" },
  ...Object.keys(PROPOSAL_STATUS_LABEL).map((value) => ({ value, label: PROPOSAL_STATUS_LABEL[value] })),
];

export default function MyProposalsPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (s: string) => {
    setProposals(null);
    const res = await api<Paginated<Proposal> & { status_counts?: Record<string, number> }>(
      `/me/proposals${s ? `?status=${s}` : ""}`,
    );
    setProposals(res.results);
    if (res.status_counts) setCounts(res.status_counts);
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load(status).catch(() => router.replace(signinHereHref()));
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

  // per-row action menu (ppt slide-16). Edit-offer is hidden until its PATCH endpoint exists.
  // No "message owner" here — per rule D-2 chat only opens once a proposal becomes an active
  // contract (the conversation then appears under «الرسائل» / the contract page).
  const rowActions = (p: Proposal): RowAction[] => [
    { label: "عرض المشروع", href: `/jobs/${p.job_slug}` },
    { label: "تعديل العرض", hidden: true },
    {
      label: "سحب العرض",
      danger: true,
      hidden: !PROPOSAL_CANCELLABLE.includes(p.status),
      disabled: busyId === p.id,
      onSelect: () => cancel(p),
    },
    { label: "الإبلاغ عن مشكلة", href: "/support" },
  ];

  return (
    <DashboardShell active="proposals" title="عروضي"
      subtitle="إدارة ومتابعة جميع العروض التي قدّمتها على مشاريع أصحاب الأعمال.">

      {/* status filter tabs with per-status counts */}
      <div className="mt-6">
        <StatusTabs tabs={FILTERS} active={status} counts={counts} onChange={setStatus} />
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
                    <span className="font-bold text-ink" dir="ltr">${p.budget}</span>
                    <span>التسليم خلال {p.delivery_days.toLocaleString("ar-EG")} يوم</span>
                    {timeAgo(p.created_at) && <span>{timeAgo(p.created_at)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[p.status] ?? "bg-tint text-primary-dark"}`}>
                    {PROPOSAL_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <RowActionMenu actions={rowActions(p)} />
                </div>
              </div>

              {p.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-sub">{p.description}</p>}

              {p.reject_reason && (
                <p className="mt-3 rounded-m bg-warn-t p-2.5 text-xs text-warn">سبب الرفض: {p.reject_reason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}

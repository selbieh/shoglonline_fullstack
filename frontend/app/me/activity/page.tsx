"use client";

import PageLoader from "@/components/PageLoader";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens, type Me } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import type { Paginated } from "@/lib/types";
import StatusTabs from "@/components/StatusTabs";
import DashboardShell from "@/components/DashboardShell";
import {
  BriefcaseIcon, ClipboardIcon, DocumentIcon, SparklesIcon,
} from "@/components/icons";
import { formatUSD } from "@/lib/currency";

/* ── shapes returned by the request/invitation list endpoints ── */
type BuyingRequest = {
  id: number;
  service: number;
  service_title: string;
  service_slug?: string;
  worker_name?: string;
  employer_name?: string;
  quantity: number;
  description?: string;
  total_price: string;
  delivery_days: number;
  status: string;
  reject_reason?: string;
  created_at: string;
};
type Invitation = {
  id: number;
  job: number;
  job_slug: string;
  job_title: string;
  employer_name?: string;
  worker_name?: string;
  private_message?: string;
  status: string;
  created_at: string;
};

const REQ_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "قيد الانتظار", tone: "bg-warn-t text-warn" },
  accepted: { label: "مقبول", tone: "bg-success-t text-success" },
  rejected: { label: "مرفوض", tone: "bg-danger-t text-danger" },
  cancelled: { label: "ملغي", tone: "bg-line/50 text-sub" },
};
const INV_STATUS: Record<string, { label: string; tone: string }> = {
  sent: { label: "بانتظار الرد", tone: "bg-warn-t text-warn" },
  accepted: { label: "مقبولة", tone: "bg-success-t text-success" },
  rejected: { label: "مرفوضة", tone: "bg-danger-t text-danger" },
  expired: { label: "منتهية", tone: "bg-line/50 text-sub" },
};

const Chip = ({ map, status }: { map: typeof REQ_STATUS; status: string }) => {
  const s = map[status] ?? { label: status, tone: "bg-tint text-primary-dark" };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${s.tone}`}>{s.label}</span>;
};

const SkeletonList = () => (
  <ul className="space-y-3" aria-hidden>
    {Array.from({ length: 3 }).map((_, i) => (
      <li key={i} className="card-modern animate-pulse p-5">
        <div className="h-5 w-2/3 rounded bg-line" />
        <div className="mt-3 h-4 w-1/3 rounded bg-line" />
      </li>
    ))}
  </ul>
);

/** Unified "my activity" hub — every request/invitation a user sent or received, role-aware
    (FR-MODE-3). Closes the gap where outgoing service requests / hire invitations had no home. */
export default function ActivityPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  // employer-side (outgoing)
  const [sentReqs, setSentReqs] = useState<BuyingRequest[] | null>(null);
  const [sentInvites, setSentInvites] = useState<Invitation[] | null>(null);
  // worker-side (incoming)
  const [inboxInvites, setInboxInvites] = useState<Invitation[] | null>(null);
  const [inboxReqs, setInboxReqs] = useState<BuyingRequest[] | null>(null);

  const [tab, setTab] = useState<"requests" | "invitations" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (mode: Me["active_mode"]) => {
    if (mode === "find_worker") {
      const [r, i] = await Promise.all([
        api<Paginated<BuyingRequest>>("/me/requests"),
        api<Paginated<Invitation>>("/me/sent-invitations"),
      ]);
      setSentReqs(r.results);
      setSentInvites(i.results);
    } else {
      const [i, r] = await Promise.all([
        api<Paginated<Invitation>>("/me/invitations"),
        api<Paginated<BuyingRequest>>("/me/service-requests"),
      ]);
      setInboxInvites(i.results);
      setInboxReqs(r.results);
    }
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    api<Me>("/auth/me")
      .then(async (data) => {
        if (!data.active_mode) {
          router.replace("/onboarding/mode");
          return;
        }
        setMe(data);
        // workers land on incoming invitations; employers on sent service requests
        setTab(data.active_mode === "find_job" ? "invitations" : "requests");
        await load(data.active_mode);
      })
      .catch(() => router.replace(signinHereHref()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(id: number, action: "cancel" | "accept", okText: string, mutate: () => void) {
    setBusyId(id);
    setMsg(null);
    try {
      await api(`/requests/${id}/${action}`, { method: "POST" });
      mutate();
      setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusyId(null);
    }
  }

  async function rejectRequest(req: BuyingRequest) {
    const reason = prompt("سبب رفض الطلب؟")?.trim();
    if (!reason) return;
    setBusyId(req.id);
    setMsg(null);
    try {
      await api(`/requests/${req.id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      setInboxReqs((l) => l?.map((x) => (x.id === req.id ? { ...x, status: "rejected", reject_reason: reason } : x)) ?? null);
      setMsg({ ok: true, text: "تم رفض الطلب" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusyId(null);
    }
  }

  async function rejectInvitation(inv: Invitation) {
    const reason = prompt("سبب الاعتذار عن الدعوة؟ (اختياري)")?.trim() ?? "";
    if (!confirm("هل تريد رفض هذه الدعوة؟")) return;
    setBusyId(inv.id);
    setMsg(null);
    try {
      await api(`/invitations/${inv.id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      setInboxInvites((l) => l?.map((x) => (x.id === inv.id ? { ...x, status: "rejected" } : x)) ?? null);
      setMsg({ ok: true, text: "تم رفض الدعوة" });
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusyId(null);
    }
  }

  if (!me || !tab) return <PageLoader />;
  const worker = me.active_mode === "find_job";

  const tabs = worker
    ? [{ value: "invitations", label: "دعوات واردة" }, { value: "requests", label: "طلبات خدمات واردة" }]
    : [{ value: "requests", label: "طلبات خدمات مُرسَلة" }, { value: "invitations", label: "دعوات مُرسَلة" }];

  // shortcuts to the pages that already exist, so this is a true "all my activity" home
  const shortcuts = worker
    ? [
        { href: "/me/proposals", label: "عروضي المقدّمة", Icon: ClipboardIcon },
        { href: "/contracts", label: "عقودي ومهامي", Icon: BriefcaseIcon },
        { href: "/me/services", label: "خدماتي", Icon: SparklesIcon },
        { href: "/invoices", label: "فواتيري", Icon: DocumentIcon },
      ]
    : [
        { href: "/me/jobs", label: "وظائفي والعروض", Icon: ClipboardIcon },
        { href: "/contracts", label: "عقودي ومشاريعي", Icon: BriefcaseIcon },
        { href: "/freelancers", label: "تصفّح المستقلين", Icon: SparklesIcon },
        { href: "/invoices", label: "الفواتير الواردة", Icon: DocumentIcon },
      ];

  return (
    <DashboardShell
      active="activity"
      title="طلباتي ونشاطي"
      subtitle={worker
        ? "كل الدعوات وطلبات الخدمات الواردة إليك في مكان واحد"
        : "تابِع كل ما أرسلته: طلبات الخدمات ودعوات العمل للمستقلين"}
    >
      {/* quick shortcuts to the rest of the workspace */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shortcuts.map(({ href, label, Icon }) => (
          <a key={href} href={href} className="card-modern group flex items-center gap-3 p-4">
            <span className="icon-tile h-10 w-10 shrink-0 bg-tint text-[18px] text-primary-dark transition group-hover:scale-105">
              <Icon />
            </span>
            <span className="min-w-0 font-semibold leading-tight text-ink group-hover:text-primary-dark">{label}</span>
          </a>
        ))}
      </div>

      <div className="mt-6">
        <StatusTabs tabs={tabs} active={tab} onChange={(v) => setTab(v as "requests" | "invitations")} />
      </div>

      {msg && (
        <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`} role="status">
          {msg.text}
        </p>
      )}

      <div className="mt-6">
        {/* ── EMPLOYER: sent service requests ── */}
        {!worker && tab === "requests" && (
          sentReqs === null ? <SkeletonList /> : sentReqs.length === 0 ? (
            <EmptyState
              title="لم ترسل أي طلب خدمة بعد"
              hint="تصفّح الخدمات الجاهزة واطلب ما يناسب مشروعك"
              href="/services" cta="تصفّح الخدمات"
            />
          ) : (
            <ul className="space-y-3">
              {sentReqs.map((r) => (
                <li key={r.id} className="card-modern p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      {r.service_slug ? (
                        <a href={`/services/${r.service_slug}`} className="font-bold leading-snug hover:text-primary-dark">
                          {r.service_title}
                        </a>
                      ) : (
                        <span className="font-bold leading-snug">{r.service_title}</span>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
                        <span>المستقل: <span className="text-ink">{r.worker_name ?? "—"}</span></span>
                        <span className="font-bold text-ink">{formatUSD(r.total_price)}</span>
                        {r.delivery_days ? <span>التسليم خلال {r.delivery_days.toLocaleString("en-US")} يوم</span> : null}
                        {timeAgo(r.created_at) && <span>{timeAgo(r.created_at)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip map={REQ_STATUS} status={r.status} />
                      {r.status === "pending" && (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => {
                            if (!confirm("هل تريد إلغاء هذا الطلب؟")) return;
                            act(r.id, "cancel", "تم إلغاء الطلب",
                              () => setSentReqs((l) => l?.map((x) => (x.id === r.id ? { ...x, status: "cancelled" } : x)) ?? null));
                          }}
                          className="btn-secondary text-xs disabled:opacity-50"
                        >
                          إلغاء
                        </button>
                      )}
                      {r.status === "accepted" && (
                        <a href="/contracts" className="btn-secondary text-xs">عرض العقد</a>
                      )}
                    </div>
                  </div>
                  {r.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-sub">{r.description}</p>}
                  {r.reject_reason && <p className="mt-3 rounded-m bg-warn-t p-2.5 text-xs text-warn">سبب الرفض: {r.reject_reason}</p>}
                </li>
              ))}
            </ul>
          )
        )}

        {/* ── EMPLOYER: sent invitations ── */}
        {!worker && tab === "invitations" && (
          sentInvites === null ? <SkeletonList /> : sentInvites.length === 0 ? (
            <EmptyState
              title="لم ترسل أي دعوة عمل بعد"
              hint="ادعُ مستقلاً مباشرةً للعمل على إحدى وظائفك"
              href="/freelancers" cta="تصفّح المستقلين"
            />
          ) : (
            <ul className="space-y-3">
              {sentInvites.map((inv) => (
                <li key={inv.id} className="card-modern p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-bold leading-snug">{inv.job_title}</span>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
                        <span>المستقل: <span className="text-ink">{inv.worker_name ?? "—"}</span></span>
                        {timeAgo(inv.created_at) && <span>{timeAgo(inv.created_at)}</span>}
                      </div>
                    </div>
                    <Chip map={INV_STATUS} status={inv.status} />
                  </div>
                  {inv.private_message && <p className="mt-3 line-clamp-2 text-sm leading-6 text-sub">{inv.private_message}</p>}
                </li>
              ))}
            </ul>
          )
        )}

        {/* ── WORKER: received invitations ── */}
        {worker && tab === "invitations" && (
          inboxInvites === null ? <SkeletonList /> : inboxInvites.length === 0 ? (
            <EmptyState
              title="لا توجد دعوات عمل بعد"
              hint="أكمِل ملفك ومعرض أعمالك ليصلك أصحاب العمل"
              href="/me/profile" cta="تحديث الملف"
            />
          ) : (
            <ul className="space-y-3">
              {inboxInvites.map((inv) => (
                <li key={inv.id} className="card-modern p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-bold leading-snug">{inv.job_title}</span>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
                        <span>صاحب العمل: <span className="text-ink">{inv.employer_name ?? "—"}</span></span>
                        {timeAgo(inv.created_at) && <span>{timeAgo(inv.created_at)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip map={INV_STATUS} status={inv.status} />
                      {inv.status === "sent" && (
                        <>
                          <a href={`/jobs/${inv.job_slug}`} className="btn-primary text-xs">عرض الوظيفة وتقديم عرض</a>
                          <button type="button" disabled={busyId === inv.id}
                            onClick={() => rejectInvitation(inv)}
                            className="btn-secondary text-xs disabled:opacity-50">اعتذار</button>
                        </>
                      )}
                    </div>
                  </div>
                  {inv.private_message && <p className="mt-3 rounded-m bg-tint p-2.5 text-sm leading-6 text-primary-dark">{inv.private_message}</p>}
                </li>
              ))}
            </ul>
          )
        )}

        {/* ── WORKER: incoming service requests ── */}
        {worker && tab === "requests" && (
          inboxReqs === null ? <SkeletonList /> : inboxReqs.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات خدمات واردة"
              hint="انشر خدماتك المميزة ليصلك المشترون"
              href="/me/services" cta="إدارة خدماتي"
            />
          ) : (
            <ul className="space-y-3">
              {inboxReqs.map((r) => (
                <li key={r.id} className="card-modern p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-bold leading-snug">{r.service_title}</span>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
                        <span>صاحب العمل: <span className="text-ink">{r.employer_name ?? "—"}</span></span>
                        <span className="font-bold text-ink">{formatUSD(r.total_price)}</span>
                        {timeAgo(r.created_at) && <span>{timeAgo(r.created_at)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip map={REQ_STATUS} status={r.status} />
                      {r.status === "pending" && (
                        <>
                          <button type="button" disabled={busyId === r.id}
                            onClick={() => act(r.id, "accept", "تم قبول الطلب وإنشاء العقد",
                              () => setInboxReqs((l) => l?.map((x) => (x.id === r.id ? { ...x, status: "accepted" } : x)) ?? null))}
                            className="btn-primary text-xs disabled:opacity-50">قبول</button>
                          <button type="button" disabled={busyId === r.id}
                            onClick={() => rejectRequest(r)}
                            className="btn-secondary text-xs disabled:opacity-50">رفض</button>
                        </>
                      )}
                      {r.status === "accepted" && <a href="/contracts" className="btn-secondary text-xs">عرض العقد</a>}
                    </div>
                  </div>
                  {r.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-sub">{r.description}</p>}
                  {r.reject_reason && <p className="mt-3 rounded-m bg-warn-t p-2.5 text-xs text-warn">سبب الرفض: {r.reject_reason}</p>}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </DashboardShell>
  );
}

function EmptyState({ title, hint, href, cta }: { title: string; hint: string; href: string; cta: string }) {
  return (
    <div className="card py-14 text-center text-sub">
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm">{hint}</p>
      <a href={href} className="btn-secondary mt-4 inline-block text-sm">{cta}</a>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import StatusTabs from "@/components/StatusTabs";
import RowActionMenu, { type RowAction } from "@/components/RowActionMenu";
import DashboardShell from "@/components/DashboardShell";
import { formatUSD } from "@/lib/currency";

type Service = { id: number; title: string; slug: string; base_price: string; status: string };
type Incoming = {
  id: number;
  service_title: string;
  quantity: number;
  total_price: string;
  description: string;
  status: string;
};

const ST_LABEL: Record<string, string> = {
  draft: "مسودة",
  pending_review: "بانتظار المراجعة",
  live: "منشورة",
  paused: "متوقفة",
  archived: "مؤرشفة",
  rejected: "مرفوضة",
};

const ST_FILTERS = [
  { value: "", label: "الكل" },
  ...Object.keys(ST_LABEL).map((value) => ({ value, label: ST_LABEL[value] })),
];

export default function MyServicesPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [busyReq, setBusyReq] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    setErr(false);
    try {
      const [s, inc] = await Promise.all([
        api<{ results: Service[]; status_counts?: Record<string, number> }>(`/me/services${status ? `?status=${status}` : ""}`),
        api<{ results: Incoming[] }>("/me/service-requests?status=pending"),
      ]);
      setServices(s.results);
      if (s.status_counts) setCounts(s.status_counts);
      setIncoming(inc.results);
    } catch {
      // api() already bounces a real 401 to sign-in; only 5xx/network errors reach here.
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load();
  }, [load, router]);

  async function action(id: number, act: string) {
    await api(`/me/services/${id}/${act}`, { method: "POST" }).catch(() => undefined);
    await load();
  }

  async function respond(id: number, act: "accept" | "reject") {
    if (busyReq !== null) return;  // guard against double-submit (accept creates a contract)
    let reason = "";
    if (act === "reject") {
      const r = prompt("سبب الرفض:");
      if (!r) return;
      reason = r;
    }
    setBusyReq(id);
    try {
      if (act === "reject") {
        await api(`/requests/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      } else {
        await api(`/requests/${id}/accept`, { method: "POST" });
      }
      await load();
    } catch {
      /* surfaced on next load; keep the row so the user can retry */
    } finally {
      setBusyReq(null);
    }
  }

  // per-row action menu (ppt slide-17). Owner edit page (slide-20) is a follow-up → معاينة links
  // to the public detail for now.
  const rowActions = (s: Service): RowAction[] => [
    { label: "لوحة الخدمة", href: `/me/services/${s.id}` },
    { label: "معاينة", href: `/services/${s.slug}` },
    { label: "نشر", hidden: !(s.status === "draft" || s.status === "rejected"), onSelect: () => action(s.id, "publish") },
    { label: "إيقاف مؤقت", hidden: s.status !== "live", onSelect: () => action(s.id, "pause") },
    { label: "استئناف", hidden: s.status !== "paused", onSelect: () => action(s.id, "resume") },
    { label: "أرشفة", danger: true, hidden: s.status === "archived", onSelect: () => action(s.id, "archive") },
  ];

  return (
    <DashboardShell active="services" title="خدماتي المصغرة"
      subtitle="إدارة ومتابعة جميع خدماتك المصغرة المنشورة والتأكد من أدائها."
      headerActions={<a href="/me/services/new" className="btn-primary">+ إضافة خدمة جديدة</a>}>

      {/* status filter tabs with per-status counts */}
      <div className="mt-5">
        <StatusTabs tabs={ST_FILTERS} active={status} counts={counts} onChange={setStatus} />
      </div>

      {incoming.length > 0 && (
        <section className="card mt-6">
          <h2 className="font-bold">طلبات شراء واردة</h2>
          <ul className="mt-3 space-y-2">
            {incoming.map((r) => (
              <li key={r.id} className="rounded-m bg-bg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.service_title} × {r.quantity}</span>
                  <span className="font-bold">{formatUSD(r.total_price)}</span>
                </div>
                {r.description && <p className="mt-1 text-sub">{r.description}</p>}
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary" disabled={busyReq !== null} onClick={() => respond(r.id, "accept")}>قبول (إنشاء عقد)</button>
                  <button className="btn-secondary" disabled={busyReq !== null} onClick={() => respond(r.id, "reject")}>رفض</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 space-y-2">
        {loading ? (
          <div className="rounded-m bg-tint p-8 text-center text-sub">جارٍ التحميل…</div>
        ) : err ? (
          <div className="rounded-m bg-danger-t p-8 text-center text-danger">
            تعذّر تحميل خدماتك.
            <button type="button" onClick={load} className="ms-2 font-bold underline">إعادة المحاولة</button>
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-m bg-tint p-8 text-center text-sub">لا خدمات بعد</div>
        ) : (
          services.map((s) => (
            <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3">
              <a href={`/me/services/${s.id}`} className="min-w-0 flex-1">
                <p className="truncate font-bold transition hover:text-primary-dark">{s.title}</p>
                <p className="mt-0.5 text-xs text-sub">{ST_LABEL[s.status]} · <span>{formatUSD(s.base_price)}</span></p>
              </a>
              <RowActionMenu actions={rowActions(s)} />
            </div>
          ))
        )}
      </section>
    </DashboardShell>
  );
}

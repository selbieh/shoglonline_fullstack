"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { STATUS_CHIP, STATUS_LABEL } from "@/lib/contractStatus";
import StatusTabs from "@/components/StatusTabs";
import RowActionMenu, { type RowAction } from "@/components/RowActionMenu";
import DashboardShell from "@/components/DashboardShell";

const STATUS_FILTERS = [
  { value: "", label: "الكل" },
  ...Object.keys(STATUS_LABEL).map((value) => ({ value, label: STATUS_LABEL[value] })),
];

type Contract = {
  id: number;
  title: string;
  budget: string;
  status: string;
  deadline: string | null;
  my_role: "employer" | "worker";
  counterpart: { id: number; name: string; email: string };
  funding_deadline: string | null;
  warranty_ends_at: string | null;
  created_at: string;
};

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [role, setRole] = useState<"all" | "employer" | "worker">("all");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (role !== "all") params.set("role", role);
      if (status) params.set("status", status);
      const qs = params.toString();
      const res = await api<{ results: Contract[]; status_counts?: Record<string, number> }>(
        `/me/contracts${qs ? `?${qs}` : ""}`,
      );
      setContracts(res.results);
      if (res.status_counts) setCounts(res.status_counts);
    } catch {
      router.replace(signinHereHref());
    }
  }, [role, status, router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load();
  }, [load, router]);

  // per-row action menu (ppt slide-14). Deliver/extend/dispute live on the contract detail page,
  // so those items deep-link there; gated by role + status.
  const rowActions = (c: Contract): RowAction[] => [
    { label: "عرض التفاصيل", href: `/contracts/${c.id}` },
    { label: "فتح المحادثة", href: "/messages" },
    { label: "تسليم العمل", hidden: c.my_role !== "worker" || c.status !== "active", href: `/contracts/${c.id}` },
    { label: "طلب تمديد", hidden: !["active", "delivered"].includes(c.status), href: `/contracts/${c.id}` },
    { label: "الإبلاغ عن مشكلة", danger: true, hidden: ["completed", "cancelled"].includes(c.status), href: `/contracts/${c.id}` },
  ];

  return (
    <DashboardShell active="tasks" title="مهامي"
      subtitle="إدارة ومتابعة جميع المهام والمشاريع التي تعمل عليها أو عملت عليها.">
      {/* role filter (secondary) */}
      <div className="mt-5 flex gap-2">
        {([
          ["all", "الكل"],
          ["employer", "كصاحب عمل"],
          ["worker", "كمستقل"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRole(key)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              role === key ? "bg-primary text-white" : "bg-bg text-sub hover:bg-tint"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* status filter tabs with per-status counts */}
      <div className="mt-4">
        <StatusTabs tabs={STATUS_FILTERS} active={status} counts={counts} onChange={setStatus} />
      </div>

      {contracts === null ? (
        <p className="mt-10 text-center text-sub">جارٍ التحميل…</p>
      ) : contracts.length === 0 ? (
        <div className="mt-10 rounded-m bg-tint p-8 text-center text-sub">
          لا عقود بعد — تنشأ العقود تلقائيًا عند قبول عرض على وظيفة.
          <div className="mt-3">
            <a href="/jobs" className="btn-secondary">تصفّح الوظائف</a>
          </div>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {contracts.map((c) => (
            <li key={c.id} className="card flex flex-wrap items-center justify-between gap-3">
              <a href={`/contracts/${c.id}`} className="min-w-0 flex-1">
                <p className="truncate font-bold transition hover:text-primary-dark">{c.title}</p>
                <p className="mt-0.5 text-xs text-sub">
                  {c.my_role === "employer" ? "أنت صاحب العمل" : "أنت المستقل"} ·{" "}
                  {c.my_role === "employer" ? "المستقل" : "صاحب العمل"}: {c.counterpart.name}
                </p>
              </a>
              <div className="flex items-center gap-3">
                <span className="font-extrabold" dir="ltr">${c.budget}</span>
                <span className={`rounded-full px-3 py-1 text-xs ${STATUS_CHIP[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
                <RowActionMenu actions={rowActions(c)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}

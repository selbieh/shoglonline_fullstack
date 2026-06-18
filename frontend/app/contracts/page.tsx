"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { STATUS_CHIP, STATUS_LABEL } from "@/lib/contractStatus";

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
  const [role, setRole] = useState<"all" | "employer" | "worker">("all");

  const load = useCallback(async () => {
    try {
      const q = role === "all" ? "" : `?role=${role}`;
      const res = await api<{ results: Contract[] }>(`/me/contracts${q}`);
      setContracts(res.results);
    } catch {
      router.replace("/signin");
    }
  }, [role, router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    load();
  }, [load, router]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">عقودي</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>
      <p className="mt-1 text-sm text-sub">
        عقودك كصاحب عمل وكمستقل في مكان واحد — نفس الحساب يعمل من الجهتين معًا.
      </p>

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
            <li key={c.id}>
              <a
                href={`/contracts/${c.id}`}
                className="card flex flex-wrap items-center justify-between gap-3 hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{c.title}</p>
                  <p className="mt-0.5 text-xs text-sub">
                    {c.my_role === "employer" ? "أنت صاحب العمل" : "أنت المستقل"} ·{" "}
                    {c.my_role === "employer" ? "المستقل" : "صاحب العمل"}: {c.counterpart.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-extrabold" dir="ltr">${c.budget}</span>
                  <span className={`rounded-full px-3 py-1 text-xs ${STATUS_CHIP[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { bidsEnabled, fetchPublicSettings } from "@/lib/settings";

type BidPlan = { id: number; name: string; bids_count: number; cost: string; description: string };
type LedgerRow = { id: number; delta: number; reason: string; created_at: string };
type History = {
  balance: number;
  summary: { granted: number; purchased: number; consumed: number; refunded: number; net: number };
  ledger: LedgerRow[];
};

const REASON_LABEL: Record<string, string> = {
  signup_grant: "هدية التسجيل",
  monthly_grant: "منحة شهرية",
  purchase: "شراء باقة",
  consume: "تقديم عرض",
  refund_moderation: "استرداد — رفض إداري",
  refund_job_closed: "استرداد — أُغلقت الوظيفة",
};

export default function BidsPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<BidPlan[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const [p, h] = await Promise.all([
      api<BidPlan[]>("/bid-plans"),
      api<History>("/me/bids/history?period=all"),
    ]);
    setPlans(p);
    setHistory(h);
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    fetchPublicSettings().then((s) => {
      const on = bidsEnabled(s);
      setEnabled(on);
      if (on) load().catch(() => router.replace("/signin"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (enabled === false) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-extrabold">نظام العروض معطّل حاليًا</h1>
        <p className="mt-3 text-sub">التقديم على الوظائف متاح مجانًا — لا حاجة لرصيد عروض.</p>
        <a href="/dashboard" className="btn-primary mt-6 inline-block">← العودة للوحتي</a>
      </main>
    );
  }

  async function buy(plan: BidPlan) {
    setBusy(plan.id);
    setMsg(null);
    try {
      await api(`/bid-plans/${plan.id}/purchase`, { method: "POST" });
      setMsg({ ok: true, text: `✅ تم شراء «${plan.name}» — أُضيف ${plan.bids_count} عرضًا لرصيدك فورًا` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusy(0);
    }
  }

  if (!history) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">رصيد العروض</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>

      {msg && (
        <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>
          {msg.text}
        </p>
      )}

      <div className="mt-6 card">
        <p className="text-sm text-sub">رصيدك الحالي</p>
        <p className="mt-1 text-4xl font-extrabold text-primary">{history.balance} <span className="text-lg">عرض</span></p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-sub sm:grid-cols-4">
          <span>هدايا: <b>{history.summary.granted}</b></span>
          <span>مشتراة: <b>{history.summary.purchased}</b></span>
          <span>مستهلكة: <b>{history.summary.consumed}</b></span>
          <span>مستردة: <b>{history.summary.refunded}</b></span>
        </div>
      </div>

      <h2 className="mt-8 text-xl font-bold">اشترِ باقة (تُدفع من رصيد محفظتك فورًا)</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className="card flex flex-col">
            <p className="text-lg font-bold">{plan.name}</p>
            <p className="mt-1 text-3xl font-extrabold text-primary">{plan.bids_count} <span className="text-sm">عرض</span></p>
            {plan.description && <p className="mt-1 text-xs text-sub">{plan.description}</p>}
            <button
              className="btn-primary mt-4"
              disabled={busy === plan.id}
              onClick={() => buy(plan)}
            >
              {busy === plan.id ? "جارٍ الشراء…" : `شراء بـ ${plan.cost}$`}
            </button>
          </div>
        ))}
        {plans.length === 0 && <p className="text-sm text-sub">لا توجد باقات متاحة حاليًا.</p>}
      </div>

      <h2 className="mt-8 text-xl font-bold">سجل الاستخدام</h2>
      <div className="mt-3 overflow-x-auto card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-tint text-right text-primary-deep">
              <th className="rounded-r-m px-3 py-2">السبب</th>
              <th className="px-3 py-2">التغيير</th>
              <th className="rounded-l-m px-3 py-2">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {history.ledger.map((row) => (
              <tr key={row.id} className="border-b border-line">
                <td className="px-3 py-2">{REASON_LABEL[row.reason] ?? row.reason}</td>
                <td className={`px-3 py-2 font-bold ${row.delta >= 0 ? "text-success" : "text-danger"}`} dir="ltr">
                  {row.delta >= 0 ? "+" : ""}{row.delta}
                </td>
                <td className="px-3 py-2 text-sub">{new Date(row.created_at).toLocaleDateString("ar")}</td>
              </tr>
            ))}
            {history.ledger.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-sub">لا حركات بعد</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

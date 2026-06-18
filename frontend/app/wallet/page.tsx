"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, tokens } from "@/lib/api";
import PaymentMethods from "@/components/PaymentMethods";
import { AlertIcon, ClockIcon, LockIcon, ReceiptIcon, ShieldIcon, WalletIcon } from "@/components/icons";

type WalletData = { currency: string; available: string; escrow_held: string; earnings_pending: string };
type Tx = { id: number; type: string; bucket: string; amount: string; status: string; note: string; created_at: string };
type Withdrawal = { id: number; amount: string; paypal_email: string; status: string; reject_reason: string; created_at: string };

const TX_LABEL: Record<string, string> = {
  deposit: "إيداع PayPal",
  withdrawal_hold: "حجز سحب",
  withdrawal_paid: "سُدّد السحب",
  withdrawal_reversed: "رُفض السحب — أُعيد المبلغ",
  bid_purchase: "شراء عروض",
  contract_hold: "حجز ضمان",
  earning: "أرباح عقد",
  commission: "عمولة",
  refund: "استرداد",
};
const ST_CHIP: Record<string, string> = {
  pending: "bg-warn-t text-warn",
  succeeded: "bg-success-t text-success",
  failed: "bg-danger-t text-danger",
  requested: "bg-warn-t text-warn",
  processing: "bg-warn-t text-warn",
  paid: "bg-success-t text-success",
  rejected: "bg-danger-t text-danger",
};
const ST_LABEL: Record<string, string> = {
  pending: "معلّق — بانتظار التأكيد",
  succeeded: "مكتمل",
  failed: "فشل",
  requested: "بانتظار المعالجة",
  processing: "قيد المعالجة",
  paid: "مدفوع",
  rejected: "مرفوض — أُعيد المبلغ",
};

export default function WalletPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>}>
      <WalletInner />
    </Suspense>
  );
}

function WalletInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [chargeAmount, setChargeAmount] = useState("50");
  const [wdAmount, setWdAmount] = useState("");
  const [wdEmail, setWdEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, t, wd] = await Promise.all([
        api<WalletData>("/me/wallet"),
        api<{ results: Tx[] }>("/me/transactions"),
        api<Withdrawal[]>("/me/withdrawals"),
      ]);
      setWallet(w);
      setTxs(t.results);
      setWithdrawals(wd);
    } catch {
      router.replace("/signin");
    }
  }, [router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    // PayPal return: ?token=<order_id> → capture (stub or live)
    const orderId = params.get("token");
    if (orderId) {
      api("/wallet/charge/confirm", { method: "POST", body: JSON.stringify({ order_id: orderId }) })
        .then(() => setMsg({ ok: true, text: "✅ تم شحن المحفظة بنجاح عبر PayPal" }))
        .catch(() => setMsg({ ok: false, text: "تعذّر تأكيد العملية — سيُعاد فحصها تلقائيًا خلال دقائق" }))
        .finally(load);
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function charge() {
    setBusy(true);
    setMsg(null);
    try {
      const order = await api<{ order_id: string; approval_url: string }>("/wallet/charge", {
        method: "POST",
        body: JSON.stringify({ amount: chargeAmount, return_url: window.location.origin + "/wallet" }),
      });
      window.location.href = order.approval_url; // PayPal approval (stub returns here instantly)
    } catch {
      setMsg({ ok: false, text: "⚠️ تحقق من المبلغ" });
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/me/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amount: wdAmount, paypal_email: wdEmail || undefined }),
      });
      setMsg({ ok: true, text: "✅ سُجّل طلب السحب وخُصم المبلغ من رصيدك فورًا — يُعاد تلقائيًا إن رُفض" });
      setWdAmount("");
      await load();
    } catch (e) {
      const raw = JSON.stringify((e as { body?: unknown }).body ?? {});
      setMsg({
        ok: false,
        text: raw.includes("insufficient")
          ? "⚠️ الرصيد المتاح غير كافٍ"
          : raw.includes("minimum")
            ? "⚠️ الحد الأدنى للسحب 10$"
            : "تعذّر تسجيل الطلب",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;
  const cur = wallet.currency === "USD" ? "$" : wallet.currency;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">محفظتي</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>

      {msg && (
        <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>
          {msg.text}
        </p>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <div className="card">
          <p className="flex items-center gap-1.5 text-sm text-sub"><WalletIcon className="text-[16px] text-emerald-600" /> الرصيد المتاح</p>
          <p className="mt-1 text-3xl font-extrabold text-success">{wallet.available} {cur}</p>
          <p className="mt-1 text-xs text-sub">جاهز للسحب أو شراء العروض أو تمويل عقود</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-1.5 text-sm text-sub"><ShieldIcon className="text-[16px] text-violet-600" /> محجوز ضمان (كصاحب عمل)</p>
          <p className="mt-1 text-3xl font-extrabold text-primary-dark">{wallet.escrow_held} {cur}</p>
          <p className="mt-1 text-xs text-sub">يُحرر أو يُرد حسب نتيجة عقودك — Phase 4</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-1.5 text-sm text-sub"><ClockIcon className="text-[16px] text-amber-600" /> أرباح معلّقة (كمستقل)</p>
          <p className="mt-1 text-3xl font-extrabold text-warn">{wallet.earnings_pending} {cur}</p>
          <p className="mt-1 text-xs text-sub">تتحرر تلقائيًا بنهاية فترة الضمان — Phase 4</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-bold">+ شحن المحفظة (PayPal)</h2>
          <div className="flex gap-2">
            <input className="w-32 rounded-m border border-line-strong px-3 py-2" value={chargeAmount}
              onChange={(e) => setChargeAmount(e.target.value)} />
            <button className="btn-primary flex-1" disabled={busy} onClick={charge}>
              المتابعة للدفع عبر PayPal
            </button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-sub">
            <LockIcon className="mt-0.5 shrink-0 text-[14px]" />
            <span>الدفع يتم بالكامل في صفحة PayPal — لا نلمس بيانات بطاقتك. يظهر الإيداع «معلّقًا» فورًا
            ويُؤكَّد خلال ثوانٍ؛ وإن تأخر تتولاه التسوية التلقائية.</span>
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">سحب الرصيد (PayPal فقط)</h2>
          <div className="flex flex-wrap gap-2">
            <input className="w-32 rounded-m border border-line-strong px-3 py-2" placeholder="المبلغ"
              value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} />
            <input className="min-w-48 flex-1 rounded-m border border-line-strong px-3 py-2" dir="ltr"
              placeholder="بريد PayPal (افتراضيًا بريد حسابك)"
              value={wdEmail} onChange={(e) => setWdEmail(e.target.value)} />
            <button className="btn-secondary" disabled={busy} onClick={withdraw}>طلب سحب</button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-sub">
            <AlertIcon className="mt-0.5 shrink-0 text-[14px] text-warn" />
            <span>يُخصم المبلغ فور التأكيد (منعًا للصرف المزدوج) · الحد الأدنى 10$ · يُعاد تلقائيًا عند الرفض</span>
          </p>
          {withdrawals.length > 0 && (
            <ul className="space-y-1 text-sm">
              {withdrawals.slice(0, 4).map((w) => (
                <li key={w.id} className="flex items-center justify-between rounded-s bg-bg px-3 py-1.5">
                  <span>#{w.id} — {w.amount} {cur} <span dir="ltr" className="text-xs text-sub">{w.paypal_email}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ST_CHIP[w.status]}`}>{ST_LABEL[w.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6">
        <PaymentMethods />
      </div>

      <section className="card mt-6">
        <h2 className="font-bold">سجل الحركات</h2>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-sub">
          <ReceiptIcon className="text-[14px]" /> دفتر قيود مزدوج غير قابل للتعديل — رصيدك دائمًا = مجموع الحركات
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-tint text-right text-primary-deep">
                <th className="rounded-r-m px-3 py-2">النوع</th>
                <th className="px-3 py-2">الرصيد</th>
                <th className="px-3 py-2">المبلغ</th>
                <th className="px-3 py-2">التاريخ</th>
                <th className="rounded-l-m px-3 py-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.id} className="border-b border-line">
                  <td className="px-3 py-2 font-medium">{TX_LABEL[tx.type] ?? tx.type}</td>
                  <td className="px-3 py-2 text-sub">{tx.bucket === "available" ? "متاح" : tx.bucket === "escrow_held" ? "ضمان" : "معلّق"}</td>
                  <td className={`px-3 py-2 font-bold ${Number(tx.amount) >= 0 ? "text-success" : "text-danger"}`} dir="ltr">
                    {Number(tx.amount) >= 0 ? "+" : ""}{tx.amount}
                  </td>
                  <td className="px-3 py-2 text-sub">{new Date(tx.created_at).toLocaleDateString("ar")}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ST_CHIP[tx.status]}`}>{ST_LABEL[tx.status]}</span>
                  </td>
                </tr>
              ))}
              {txs.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sub">لا حركات بعد — اشحن محفظتك للبدء</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

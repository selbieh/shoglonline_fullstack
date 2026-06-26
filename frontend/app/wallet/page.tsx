"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { USD_LABEL } from "@/lib/currency";
import { AlertIcon, ClockIcon, LockIcon, ReceiptIcon, ShieldIcon, WalletIcon } from "@/components/icons";
import KpiCard from "@/components/KpiCard";

type WalletData = { currency: string; available: string; escrow_held: string; earnings_pending: string };
type Tx = { id: number; type: string; bucket: string; amount: string; status: string; note: string; created_at: string; reference?: string; gateway?: string; gateway_ref?: string };
type Withdrawal = { id: number; amount: string; paypal_email: string; status: string; reject_reason: string; created_at: string };
type PayoutMethod = { id: number; kind: string; label: string; country: string; details: Record<string, string>; is_default: boolean };

const PAYOUT_KIND_LABEL: Record<string, string> = {
  paypal: "PayPal", bank_transfer: "تحويل بنكي", e_wallet: "محفظة إلكترونية",
  bank_card: "بطاقة بنكية", instapay: "إنستاباي",
};

const QUICK_AMOUNTS = [50, 100, 250, 500]; // ppt slide-33 preset top-up chips

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
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [chargeAmount, setChargeAmount] = useState("50");
  const [wdAmount, setWdAmount] = useState("");
  const [wdEmail, setWdEmail] = useState("");
  const [wdMethodId, setWdMethodId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Tx | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, t, wd, pm] = await Promise.all([
        api<WalletData>("/me/wallet"),
        api<{ results: Tx[] }>("/me/transactions"),
        api<Withdrawal[]>("/me/withdrawals"),
        api<{ results: PayoutMethod[] } | PayoutMethod[]>("/me/payout-methods").catch(() => [] as PayoutMethod[]),
      ]);
      setWallet(w);
      setTxs(t.results);
      setWithdrawals(wd);
      setPayoutMethods(Array.isArray(pm) ? pm : pm.results ?? []);
    } catch {
      router.replace(signinHereHref());
    }
  }, [router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
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
  const cur = wallet.currency === "USD" ? USD_LABEL : wallet.currency;

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

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<WalletIcon />} tone="bg-tint text-primary-dark" label="الرصيد الكلي"
          value={`${(Number(wallet.available) + Number(wallet.escrow_held) + Number(wallet.earnings_pending)).toFixed(2)} ${cur}`}
          subtitle="إجمالي رصيدك عبر كل المحافظ" />
        <KpiCard icon={<WalletIcon />} tone="bg-success-t text-success" label="الرصيد المتاح (القابل للسحب)"
          value={`${wallet.available} ${cur}`} subtitle="جاهز للسحب أو شراء العروض أو تمويل عقود" />
        <KpiCard icon={<ShieldIcon />} tone="bg-accent-sky text-primary-deep" label="محجوز ضمان (كصاحب عمل)"
          value={`${wallet.escrow_held} ${cur}`} subtitle="يُحرر أو يُرد حسب نتيجة عقودك" />
        <KpiCard icon={<ClockIcon />} tone="bg-warn-t text-warn" label="أرباح معلّقة (كمستقل)"
          value={`${wallet.earnings_pending} ${cur}`} subtitle="تتحرر تلقائيًا بنهاية فترة الضمان" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-bold">+ شحن المحفظة (PayPal)</h2>
          {/* quick-amount chips (ppt slide-33) */}
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <button key={a} type="button"
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                  chargeAmount === String(a) ? "bg-primary text-white" : "bg-tint text-primary-dark hover:bg-primary/10"
                }`}
                onClick={() => setChargeAmount(String(a))}>
                {a} {cur}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="w-32 field" inputMode="decimal" value={chargeAmount}
              onChange={(e) => setChargeAmount(e.target.value)} />
            <button className="btn-primary flex-1" disabled={busy || !(Number(chargeAmount) > 0)} onClick={charge}>
              المتابعة للدفع عبر PayPal
            </button>
          </div>
          {/* breakdown (ppt slide-33) — full amount is credited; no platform fee on top-up */}
          <dl className="rounded-m bg-bg p-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-sub">المبلغ المطلوب</dt>
              <dd className="font-medium text-ink" dir="ltr">{(Number(chargeAmount) || 0).toFixed(2)} {cur}</dd>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <dt className="text-sub">رسوم المنصة</dt>
              <dd className="font-medium text-success" dir="ltr">0.00 {cur}</dd>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-line pt-1.5">
              <dt className="font-bold text-ink">يُضاف إلى رصيدك</dt>
              <dd className="font-extrabold text-primary-dark" dir="ltr">{(Number(chargeAmount) || 0).toFixed(2)} {cur}</dd>
            </div>
          </dl>
          <p className="flex items-start gap-1.5 text-xs text-sub">
            <LockIcon className="mt-0.5 shrink-0 text-[14px]" />
            <span>الدفع يتم بالكامل في صفحة PayPal — لا نلمس بيانات بطاقتك. يظهر الإيداع «معلّقًا» فورًا
            ويُؤكَّد خلال ثوانٍ؛ وإن تأخر تتولاه التسوية التلقائية.</span>
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">سحب الرصيد (PayPal فقط)</h2>

          {payoutMethods.length === 0 ? (
            /* empty state (ppt slide-36): no saved payout method yet → guide to add one */
            <div className="rounded-m border border-dashed border-line bg-bg p-5 text-center">
              <p className="text-sm font-medium text-ink">لا توجد وسيلة استلام محفوظة</p>
              <p className="mt-1 text-xs text-sub">أضف وسيلة استلام الأرباح أولًا لتتمكن من سحب رصيدك.</p>
              <a href="/settings/payouts" className="btn-primary mt-3 inline-block text-sm">+ إضافة وسيلة استلام</a>
            </div>
          ) : (
            <>
              {/* pick a saved method (ppt slide-36) */}
              <label className="block text-sm font-medium text-ink">وسيلة الاستلام
                <select className="field mt-1" value={wdMethodId}
                  onChange={(e) => {
                    setWdMethodId(e.target.value);
                    const m = payoutMethods.find((x) => String(x.id) === e.target.value);
                    if (m?.kind === "paypal") setWdEmail(m.details.paypal_email || m.label || "");
                  }}>
                  <option value="">اختر وسيلة محفوظة…</option>
                  {payoutMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {PAYOUT_KIND_LABEL[m.kind] ?? m.kind}{m.is_default ? " (افتراضية)" : ""} — {m.label || Object.values(m.details)[0] || "—"}
                    </option>
                  ))}
                </select>
              </label>
              <a href="/settings/payouts" className="inline-block text-xs font-medium text-primary-dark hover:underline">إدارة وسائل الاستلام ←</a>

              <div className="flex flex-wrap gap-2">
                <input className="w-32 field" placeholder="المبلغ"
                  value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} />
                <input className="min-w-48 flex-1 field" dir="auto" type="email" inputMode="email"
                  placeholder="بريد PayPal (افتراضيًا بريد حسابك)"
                  value={wdEmail} onChange={(e) => setWdEmail(e.target.value)} />
                <button className="btn-secondary" disabled={busy || !(Number(wdAmount) >= 10)} onClick={withdraw}>طلب سحب</button>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-sub">
                <AlertIcon className="mt-0.5 shrink-0 text-[14px] text-warn" />
                <span>يُخصم المبلغ فور التأكيد (منعًا للصرف المزدوج) · الحد الأدنى 10 {cur} · يُعاد تلقائيًا عند الرفض</span>
              </p>
            </>
          )}
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
                <th className="px-3 py-2">الحالة</th>
                <th className="rounded-l-m px-3 py-2">الإيصال</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.id} className="border-b border-line">
                  <td className="px-3 py-2 font-medium">{TX_LABEL[tx.type] ?? tx.type}</td>
                  <td className="px-3 py-2 text-sub">{tx.bucket === "available" ? "متاح" : tx.bucket === "escrow_held" ? "ضمان" : "معلّق"}</td>
                  <td className={`px-3 py-2 font-bold ${Number(tx.amount) >= 0 ? "text-success" : "text-danger"}`} dir="ltr">
                    {Number(tx.amount) >= 0 ? "+" : ""}{tx.amount} {cur}
                  </td>
                  <td className="px-3 py-2 text-sub">{new Date(tx.created_at).toLocaleDateString("ar-u-nu-latn")}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ST_CHIP[tx.status]}`}>{ST_LABEL[tx.status]}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button className="text-xs font-medium text-primary-dark hover:underline" onClick={() => setReceipt(tx)}>عرض</button>
                  </td>
                </tr>
              ))}
              {txs.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sub">لا حركات بعد — اشحن محفظتك للبدء</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {receipt && (
        <div className="fixed inset-0 z-50 grid place-content-center bg-black/40 p-4" role="dialog" aria-modal="true"
          onClick={() => setReceipt(null)}>
          <div className="w-full max-w-sm rounded-l bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <ReceiptIcon className="text-[18px] text-primary" />
              <h3 className="font-extrabold">إيصال المعاملة</h3>
            </div>
            <dl className="mt-4 space-y-2.5 text-sm">
              <RRow k="رقم الإيصال" v={receipt.reference || `TRX-${receipt.id}`} ltr />
              <RRow k="النوع" v={TX_LABEL[receipt.type] ?? receipt.type} />
              <RRow k="المبلغ" v={`${Number(receipt.amount) >= 0 ? "+" : ""}${receipt.amount} ${cur}`} ltr />
              <RRow k="الرصيد" v={receipt.bucket === "available" ? "متاح" : receipt.bucket === "escrow_held" ? "ضمان" : "معلّق"} />
              <RRow k="الحالة" v={ST_LABEL[receipt.status] ?? receipt.status} />
              <RRow k="التاريخ" v={new Date(receipt.created_at).toLocaleString("ar-u-nu-latn")} />
              {receipt.gateway && <RRow k="البوابة" v={receipt.gateway} ltr />}
              {receipt.gateway_ref && <RRow k="مرجع البوابة" v={receipt.gateway_ref} ltr />}
              {receipt.note && <RRow k="ملاحظة" v={receipt.note} />}
            </dl>
            <div className="mt-5 flex gap-2">
              <button className="btn-primary flex-1" onClick={() => window.print()}>طباعة</button>
              <button className="btn-secondary" onClick={() => setReceipt(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function RRow({ k, v, ltr }: { k: string; v: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sub">{k}</dt>
      <dd className="font-medium text-ink" dir={ltr ? "ltr" : undefined}>{v}</dd>
    </div>
  );
}

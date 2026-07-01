"use client";

import PageLoader from "@/components/PageLoader";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { USD_LABEL } from "@/lib/currency";
import { toAsciiDigits } from "@/lib/arabic";
import { LockIcon, WalletIcon } from "@/components/icons";
import { loadPayPalSdk, safeReturnPath, type PayPalConfig } from "@/lib/paypal";

const QUICK_AMOUNTS = [50, 100, 250, 500]; // ppt slide-33 preset top-up chips
// Survives the redirect (stub / SDK-less) fallback, where query params can't be round-tripped cleanly.
const RETURN_KEY = "sh_charge_return";

export default function ChargePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ChargeInner />
    </Suspense>
  );
}

function ChargeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnPath(params.get("return"));
  const need = Number(toAsciiDigits(params.get("amount") || "")) || 0;

  const [wallet, setWallet] = useState<{ available: string; currency: string } | null>(null);
  const [chargeAmount, setChargeAmount] = useState(need > 0 ? String(Math.ceil(need)) : "50");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // PayPal's popup closes the instant the buyer approves; this gates a blocking overlay during the
  // server-side capture so the buyer isn't staring at a frozen page wondering if the payment went through.
  const [capturing, setCapturing] = useState(false);
  const [cfg, setCfg] = useState<PayPalConfig | null>(null);
  const [ppReady, setPpReady] = useState(false);
  const [ppFailed, setPpFailed] = useState(false);

  // createOrder runs inside a closure captured at button-render time; read the live amount via a ref
  // so the buttons never need re-rendering when the chosen amount changes.
  const amountRef = useRef(chargeAmount);
  amountRef.current = chargeAmount;
  const ppContainer = useRef<HTMLDivElement>(null);
  const ppRendered = useRef(false);

  const useButtons = !!(cfg && cfg.paypal_client_id && !cfg.stub) && !ppFailed;

  const loadWallet = useCallback(async () => {
    try {
      setWallet(await api<{ available: string; currency: string }>("/me/wallet"));
    } catch {
      /* balance context is best-effort; charging still works without it */
    }
  }, []);

  // On a confirmed top-up, send the user back to whatever they were doing (fund a contract, buy bids…).
  const onSuccess = useCallback(() => {
    setMsg({ ok: true, text: "✅ تم شحن المحفظة بنجاح — نعيدك لإكمال ما بدأته…" });
    loadWallet();
    const dest = sessionStorage.getItem(RETURN_KEY) || returnTo;
    sessionStorage.removeItem(RETURN_KEY);
    setTimeout(() => router.push(dest), 1200);
  }, [router, returnTo, loadWallet]);

  // Capture is server-side and returns the settled status — only a real "succeeded" credits the
  // wallet. A 200 response does NOT mean the money moved (a declined/415 capture also returns 200).
  const confirmOrder = useCallback(
    async (orderId: string) => {
      setMsg(null);
      setCapturing(true);
      try {
        const res = await api<{ status: string; available: string }>("/wallet/charge/confirm", {
          method: "POST",
          body: JSON.stringify({ order_id: orderId }),
        });
        if (res.status === "succeeded") {
          onSuccess();
        } else if (res.status === "pending") {
          setMsg({ ok: false, text: "الدفع قيد المعالجة لدى PayPal — سيُحدّث رصيدك تلقائيًا خلال دقائق." });
          loadWallet();
        } else {
          setMsg({ ok: false, text: "تعذّر إتمام الدفع — لم يُخصم أي مبلغ. جرّب مجددًا أو استخدم وسيلة أخرى." });
        }
      } catch {
        setMsg({ ok: false, text: "تعذّر تأكيد العملية — سيُعاد فحصها تلقائيًا خلال دقائق" });
      } finally {
        setCapturing(false);
      }
    },
    [onSuccess, loadWallet],
  );

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    // Redirect-flow return (?token=<order_id>): capture, then forward to the caller.
    const orderId = params.get("token");
    if (orderId) {
      window.history.replaceState(null, "", "/wallet/charge"); // drop ?token so a refresh won't re-confirm
      confirmOrder(orderId);
    } else {
      loadWallet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Publishable PayPal config (client-id / currency / stub). Falls back to the redirect flow on error.
  useEffect(() => {
    api<PayPalConfig>("/payments/config")
      .then(setCfg)
      .catch(() => setCfg({ paypal_client_id: "", currency: "USD", stub: true }));
  }, []);

  // Render the Smart Buttons (PayPal + Debit/Credit Card) once config is in and we're on a live account.
  useEffect(() => {
    if (!cfg || !cfg.paypal_client_id || cfg.stub || ppRendered.current) return;
    let cancelled = false;
    loadPayPalSdk(cfg.paypal_client_id, cfg.currency).then((paypal) => {
      if (cancelled || ppRendered.current) return;
      if (!paypal || !ppContainer.current) {
        setPpFailed(true); // SDK blocked/failed → show the redirect button instead
        return;
      }
      ppRendered.current = true;
      paypal
        .Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay" },
          // Order is created server-side so the amount and ledger row are authoritative.
          createOrder: async () => {
            const amt = Number(amountRef.current);
            if (!(amt > 0)) {
              setMsg({ ok: false, text: "⚠️ تحقق من المبلغ" });
              throw new Error("invalid_amount");
            }
            setMsg(null);
            const order = await api<{ order_id: string }>("/wallet/charge", {
              method: "POST",
              body: JSON.stringify({ amount: amountRef.current, return_url: window.location.origin + "/wallet/charge" }),
            });
            return order.order_id;
          },
          // Capture on our server (idempotent) — the same path the redirect flow uses.
          onApprove: async (data) => {
            await confirmOrder(data.orderID);
          },
          onCancel: () => setMsg({ ok: false, text: "أُلغيت عملية الدفع" }),
          onError: () => setMsg({ ok: false, text: "حدث خطأ في بوابة الدفع — حاول مجددًا أو استخدم وسيلة أخرى" }),
        })
        .render(ppContainer.current)
        .then(() => !cancelled && setPpReady(true))
        .catch(() => !cancelled && setPpFailed(true));
    });
    return () => {
      cancelled = true;
    };
  }, [cfg, confirmOrder]);

  // Redirect fallback (stub / no SDK): stash the return path, then bounce to PayPal's approval page.
  async function charge() {
    setBusy(true);
    setMsg(null);
    try {
      sessionStorage.setItem(RETURN_KEY, returnTo);
      const order = await api<{ order_id: string; approval_url: string }>("/wallet/charge", {
        method: "POST",
        body: JSON.stringify({ amount: chargeAmount, return_url: window.location.origin + "/wallet/charge" }),
      });
      window.location.href = order.approval_url;
    } catch (e) {
      // Only a 400 from the charge endpoint is an amount/validation problem; a 500, network
      // failure, or PayPal/config error is not — telling the user to "check the amount" then is
      // misleading and leaves them retrying a perfectly valid amount.
      const err = e as { status?: number; body?: { message_ar?: string } };
      const text =
        err.status === 400
          ? err.body?.message_ar || "⚠️ تحقق من المبلغ"
          : "تعذّر بدء عملية الدفع — حاول مجددًا";
      setMsg({ ok: false, text });
      setBusy(false);
    }
  }

  const cur = wallet?.currency === "USD" ? USD_LABEL : wallet?.currency || USD_LABEL;
  const available = wallet ? Number(wallet.available) : null;
  const shortfall = need > 0 && available !== null ? Math.max(0, need - available) : 0;

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      {/* Blocking overlay while the server captures the approved order — bridges the dead-time after
          PayPal's popup closes so the buyer doesn't think nothing happened (and can't double-submit). */}
      {capturing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
          role="status" aria-live="polite" aria-busy="true">
          <div className="flex flex-col items-center gap-3 rounded-l bg-white px-9 py-7 shadow-xl">
            <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-primary" aria-hidden />
            <p className="text-sm font-bold text-ink">جارٍ تأكيد الدفع…</p>
            <p className="text-xs text-sub">لا تُغلق هذه الصفحة</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">شحن المحفظة</h1>
        <a href={returnTo} className="text-sm text-primary-dark">→ رجوع</a>
      </div>

      {/* balance + (optional) why-you're-here context */}
      <div className="mt-6 rounded-l bg-tint p-5">
        <div className="flex items-center gap-3">
          <span className="icon-tile h-10 w-10 shrink-0 bg-white text-[18px] text-primary-dark"><WalletIcon /></span>
          <div>
            <p className="text-sm text-sub">رصيدك المتاح الآن</p>
            <p className="text-2xl font-extrabold text-primary-deep" dir="ltr">
              {available !== null ? `${available.toFixed(2)} ${cur}` : "…"}
            </p>
          </div>
        </div>
        {need > 0 && (
          <p className="mt-3 rounded-m bg-white/70 p-2.5 text-sm text-ink">
            تحتاج <b dir="ltr">{need.toFixed(2)} {cur}</b> لإتمام العملية.
            {shortfall > 0
              ? <> ينقصك <b dir="ltr">{shortfall.toFixed(2)} {cur}</b> — اشحن هذا المبلغ أو أكثر.</>
              : <> رصيدك يكفي بالفعل ✅</>}
          </p>
        )}
      </div>

      {msg && (
        <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>
          {msg.text}
        </p>
      )}

      <section className="card mt-6 space-y-3">
        <h2 className="font-bold">المبلغ المراد شحنه</h2>
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
        <input className="w-full field" inputMode="decimal" value={chargeAmount}
          onChange={(e) => setChargeAmount(toAsciiDigits(e.target.value))} />

        {/* breakdown — full amount is credited; no platform fee on top-up */}
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

        {/* Smart Buttons (PayPal + Debit/Credit Card) on live accounts; redirect button otherwise. */}
        {!useButtons && (
          <button className="btn-primary w-full" disabled={busy || !(Number(chargeAmount) > 0)} onClick={charge}>
            المتابعة للدفع عبر PayPal أو بطاقة
          </button>
        )}
        {useButtons && (
          <div className={Number(chargeAmount) > 0 ? "" : "pointer-events-none opacity-50"}>
            <div ref={ppContainer} className="min-h-[44px]" />
            {!ppReady && <p className="text-xs text-sub">جارٍ تحميل بوابة الدفع…</p>}
          </div>
        )}

        <p className="flex items-start gap-1.5 text-xs text-sub">
          <LockIcon className="mt-0.5 shrink-0 text-[14px]" />
          <span>ادفع عبر حساب PayPal أو ببطاقة ائتمان/خصم مباشرةً — المعالجة تتم بالكامل لدى PayPal ولا
          نلمس بيانات بطاقتك. يظهر الإيداع «معلّقًا» فورًا ويُؤكَّد خلال ثوانٍ؛ وإن تأخر تتولاه التسوية التلقائية.</span>
        </p>
      </section>
    </main>
  );
}

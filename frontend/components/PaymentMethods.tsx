"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { LockIcon } from "@/components/icons";

type Method = {
  id: number;
  type: "paypal" | "card";
  provider: string;
  brand: string;
  last4: string;
  label: string;
  is_default: boolean;
};

/**
 * Saved payment methods (FR-PAY-4). Card data NEVER touches us — the gateway tokenizes and we store
 * only an opaque token + masked display (PCI SAQ-A). This control submits the gateway token, not a PAN.
 */
export default function PaymentMethods() {
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setMethods(await api<Method[]>("/me/payment-methods"));
    } catch {
      setMethods([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addPaypal() {
    setBusy(true);
    setError("");
    try {
      // In production the token comes from the PayPal SDK after the user authorizes; never a PAN.
      await api("/me/payment-methods", {
        method: "POST",
        body: JSON.stringify({ type: "paypal", provider: "paypal", label: label || "PayPal", gateway_token: `vault-${Date.now()}` }),
      });
      setLabel("");
      await load();
    } catch (e) {
      setError(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(id: number) {
    await api(`/me/payment-methods/${id}`, { method: "PATCH", body: JSON.stringify({ is_default: true }) }).catch(() => undefined);
    await load();
  }

  async function remove(id: number) {
    await api(`/me/payment-methods/${id}`, { method: "DELETE" }).catch(() => undefined);
    await load();
  }

  if (!methods) return <p className="text-sm text-sub">جارٍ التحميل…</p>;

  return (
    <section className="card" aria-label="طرق الدفع المحفوظة">
      <h2 className="font-bold">طرق الدفع المحفوظة</h2>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-sub"><LockIcon className="text-[13px]" /> لا نخزّن أرقام البطاقات — يتم التوكنز في بوابة الدفع (PCI SAQ-A).</p>

      <ul className="mt-3 space-y-2">
        {methods.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-s bg-bg px-3 py-2 text-sm">
            <span>
              {m.type === "paypal" ? "PayPal" : `${m.brand || "بطاقة"} ••••${m.last4}`}
              {m.label && <span className="text-sub"> — {m.label}</span>}
              {m.is_default && <span className="mr-2 rounded-full bg-success-t px-2 py-0.5 text-xs text-success">افتراضي</span>}
            </span>
            <span className="flex gap-3">
              {!m.is_default && (
                <button onClick={() => makeDefault(m.id)} className="text-xs text-primary-dark">اجعلها افتراضية</button>
              )}
              <button onClick={() => remove(m.id)} className="text-xs text-danger">حذف</button>
            </span>
          </li>
        ))}
        {methods.length === 0 && <li className="text-sm text-sub">لا طرق دفع محفوظة بعد.</li>}
      </ul>

      <div className="mt-3 flex gap-2">
        <input className="flex-1 rounded-m border border-line-strong px-3 py-2 text-sm" dir="ltr"
          placeholder="بريد PayPal (اختياري)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn-secondary" disabled={busy} onClick={addPaypal}>ربط PayPal</button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

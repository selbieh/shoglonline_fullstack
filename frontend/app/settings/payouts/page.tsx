"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { useFieldErrors } from "@/lib/useFieldErrors";
import Field from "@/components/Field";

/* Receive-earnings / payout methods hub (ppt slides 38–42), on the PayoutMethod backend.
   PayPal + bank transfer are international; e-wallet / bank card / Instapay are Egypt-only. */

type PayoutMethod = {
  id: number; kind: string; label: string; country: string;
  details: Record<string, string>; is_default: boolean;
};

type FieldDef = { k: string; label: string; type?: string };
type KindDef = { v: string; t: string; region: string; egyptOnly?: boolean; fields: FieldDef[] };

const KINDS: KindDef[] = [
  { v: "paypal", t: "PayPal", region: "دولي", fields: [
    { k: "paypal_email", label: "البريد الإلكتروني لـ PayPal", type: "email" },
  ] },
  { v: "bank_transfer", t: "تحويل بنكي", region: "دولي", fields: [
    { k: "account_holder", label: "اسم صاحب الحساب" },
    { k: "iban", label: "رقم IBAN" },
    { k: "bank_name", label: "اسم البنك" },
    { k: "branch", label: "الفرع" },
    { k: "swift_bic", label: "رمز SWIFT / BIC" },
    { k: "city", label: "المدينة" },
  ] },
  { v: "e_wallet", t: "محفظة إلكترونية", region: "مصر فقط", egyptOnly: true, fields: [
    { k: "wallet_number", label: "رقم المحفظة" },
    { k: "holder", label: "اسم صاحب المحفظة" },
    { k: "provider", label: "مزود المحفظة (Vodafone / Orange / Etisalat / WE)" },
  ] },
  { v: "instapay", t: "Instapay", region: "مصر فقط", egyptOnly: true, fields: [
    { k: "link_or_phone", label: "رابط الدفع أو رقم الهاتف المرتبط" },
    { k: "display_name", label: "الاسم الذي يظهر عند التحويل" },
  ] },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.v, k.t]));

export default function PayoutsPage() {
  const router = useRouter();
  const [methods, setMethods] = useState<PayoutMethod[] | null>(null);
  const [kind, setKind] = useState<string>("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const { errors, formError, applyApiError, reset } = useFieldErrors();

  async function load() {
    const res = await api<{ results: PayoutMethod[] } | PayoutMethod[]>("/me/payout-methods");
    setMethods(Array.isArray(res) ? res : res.results);
  }

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load().catch(() => router.replace(signinHereHref()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = KINDS.find((k) => k.v === kind);

  function pickKind(v: string) {
    setKind(v);
    setDetails({});
    setLabel("");
    reset();
  }

  async function add() {
    if (!active) return;
    setBusy(true);
    reset();
    try {
      const trimmed: Record<string, string> = {};
      for (const [k, v] of Object.entries(details)) trimmed[k] = v.trim();
      await api("/me/payout-methods", {
        method: "POST",
        body: JSON.stringify({
          kind,
          label: label.trim(),
          country: active.egyptOnly ? "EG" : "",
          details: trimmed,
        }),
      });
      setKind("");
      setDetails({});
      setLabel("");
      await load();
    } catch (e) {
      applyApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(m: PayoutMethod) {
    await api(`/me/payout-methods/${m.id}`, { method: "PATCH", body: JSON.stringify({ is_default: true }) }).catch(() => undefined);
    await load();
  }

  async function remove(m: PayoutMethod) {
    if (!confirm("حذف وسيلة الاستلام هذه؟")) return;
    await api(`/me/payout-methods/${m.id}`, { method: "DELETE" }).catch(() => undefined);
    await load();
  }

  return (
    <>
      <section className="card">
        <h2 className="font-bold">استلام الأرباح</h2>
        <p className="mt-1 text-sm text-sub">أضف وسائل استلام أرباحك واختر الطريقة المناسبة لتحويل مستحقاتك.</p>

        {/* saved methods */}
        {methods === null ? (
          <p className="mt-4 text-sm text-sub">جارٍ التحميل…</p>
        ) : methods.length === 0 ? (
          <p className="mt-4 rounded-m bg-tint p-4 text-sm text-sub">لا توجد وسائل استلام محفوظة بعد.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {methods.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-m border border-line p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold">
                    {KIND_LABEL[m.kind] ?? m.kind}
                    {m.is_default && <span className="chip bg-success-t text-success">افتراضية</span>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-sub">
                    {m.label || Object.values(m.details)[0] || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {!m.is_default && (
                    <button onClick={() => setDefault(m)} className="text-primary-dark hover:underline">تعيين افتراضية</button>
                  )}
                  <button onClick={() => remove(m)} className="text-danger hover:underline">حذف</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* add a method */}
      <section className="card">
        <h2 className="font-bold">إضافة وسيلة استلام</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.v}
              type="button"
              onClick={() => pickKind(k.v)}
              className={`rounded-l border p-3 text-right transition ${kind === k.v ? "border-primary bg-tint" : "border-line bg-white hover:border-primary/40"}`}
            >
              <span className="block text-sm font-bold text-ink">{k.t}</span>
              <span className="mt-1 block text-xs text-sub">{k.region}</span>
            </button>
          ))}
        </div>

        {active && (
          <div className="mt-4 space-y-3">
            {active.fields.map((f) => (
              <Field key={f.k} label={f.label} error={errors[f.k]}>
                <input
                  className="field"
                  type={f.type ?? "text"}
                  value={details[f.k] ?? ""}
                  onChange={(e) => setDetails((d) => ({ ...d, [f.k]: e.target.value }))}
                />
              </Field>
            ))}
            <Field label="اسم مستعار (اختياري)" error={errors.label}>
              <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: حساب الأرباح الرئيسي" />
            </Field>
            {active.egyptOnly && <p className="text-xs text-sub">هذه الوسيلة متاحة داخل مصر فقط.</p>}
            {formError && <p className="rounded-m bg-danger-t p-3 text-sm text-danger">{formError}</p>}
            <button className="btn-primary" disabled={busy || active.fields.some((f) => !(details[f.k] ?? "").trim())}
              onClick={add}>{busy ? "جارٍ الحفظ…" : "حفظ الوسيلة"}</button>
          </div>
        )}
      </section>
    </>
  );
}

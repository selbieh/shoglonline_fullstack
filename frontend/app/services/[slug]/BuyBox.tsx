"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { signinHereHref } from "@/lib/nav";
import { HeartIcon } from "@/components/icons";

export type Addon = { id: number; title: string; price: string; extra_days: number };
export type ServiceLite = { id: number; base_price: string; addons: Addon[] };

/** Interactive favourite + buy box (client island); the service content is SSR. */
export default function BuyBox({ service }: { service: ServiceLite }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState<number[]>([]);
  const [desc, setDesc] = useState("");
  const [fav, setFav] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(tokens.access));
  }, []);

  const addonsTotal = service.addons
    .filter((a) => picked.includes(a.id))
    .reduce((sum, a) => sum + Number(a.price), 0);
  const total = (Number(service.base_price) + addonsTotal) * qty;

  async function toggleFav() {
    if (!tokens.access) return router.push(signinHereHref());
    await api(`/me/favorites/${service.id}`, { method: fav ? "DELETE" : "PUT" }).catch(() => undefined);
    setFav((v) => !v);
  }

  async function buy() {
    if (!tokens.access) return router.push(signinHereHref());
    setBusy(true);
    setMsg(null);
    try {
      await api(`/services/${service.id}/requests`, {
        method: "POST",
        body: JSON.stringify({ quantity: qty, description: desc, addon_ids: picked }),
      });
      setMsg({ ok: true, text: "✅ أُرسل طلب الشراء — بانتظار قبول المستقل" });
    } catch (e) {
      setMsg({ ok: false, text: `⚠️ ${apiError(e).message_ar}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={toggleFav}
          className={`grid h-10 w-10 place-content-center rounded-full text-[22px] transition ${fav ? "bg-danger-t text-danger" : "text-sub hover:bg-danger-t hover:text-danger"}`}
          aria-label="المفضلة"
        >
          <HeartIcon filled={fav} />
        </button>
      </div>

      {msg && (
        <p className={`mb-3 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>
          {msg.text}
        </p>
      )}

      <section className="card space-y-3">
        <h2 className="font-bold">اطلب هذه الخدمة</h2>

        {service.addons.length > 0 && (
          <div>
            <p className="text-sm text-sub">إضافات اختيارية</p>
            <ul className="mt-2 space-y-1">
              {service.addons.map((a) => (
                <li key={a.id}>
                  <label className="flex items-center justify-between rounded-m bg-bg px-3 py-2 text-sm">
                    <span>
                      <input type="checkbox" className="ml-2" checked={picked.includes(a.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                      {a.title}
                    </span>
                    <span dir="ltr">+${a.price}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="text-sm text-sub">الكمية</label>
          <input type="number" min={1} className="w-20 field"
            value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
        </div>

        <textarea className="w-full field" rows={3}
          placeholder="تفاصيل طلبك (اختياري)" value={desc} onChange={(e) => setDesc(e.target.value)} />

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-sub">الإجمالي</span>
          <span className="text-2xl font-extrabold text-primary" dir="ltr">${total.toFixed(2)}</span>
        </div>
        {authed ? (
          <button className="btn-primary w-full" disabled={busy} onClick={buy}>إرسال طلب الشراء</button>
        ) : (
          <button type="button" onClick={() => router.push(signinHereHref())} className="btn-primary block w-full text-center">سجّل الدخول لإرسال الطلب</button>
        )}
        <p className="text-xs text-sub">
          يُحجز المبلغ في الضمان عند قبول المستقل ويُحرَّر بعد تسليمك وقبولك للعمل.
        </p>
      </section>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { signinHereHref } from "@/lib/nav";
import { HeartIcon, EnvelopeIcon } from "@/components/icons";
import { formatUSD } from "@/lib/currency";

export type Addon = { id: number; title: string; price: string; extra_days: number };
export type ServiceLite = {
  id: number;
  base_price: string;
  addons: Addon[];
  /** The freelancer who owns this service — lets us hide the «تواصل» button when the owner views
      their own service (they can't open an inquiry chat with themselves). */
  worker: number;
};

/** Interactive favourite + buy box (client island); the service content is SSR. */
export default function BuyBox({ service }: { service: ServiceLite }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState<number[]>([]);
  const [desc, setDesc] = useState("");
  const [fav, setFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [myId, setMyId] = useState<number | null>(null);

  useEffect(() => {
    const a = Boolean(tokens.access);
    setAuthed(a);
    if (!a) return;
    // Learn who's viewing so we can hide «تواصل» on the owner's own service (self-chat is blocked).
    api<{ id: number }>(`/auth/me`).then((m) => setMyId(m.id)).catch(() => undefined);
    // Hydrate the heart from the server so an already-favorited service shows as favorited.
    api<unknown>(`/me/favorites?kind=service`)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : ((rows as { results?: unknown[] })?.results ?? []);
        setFav(list.some((s) => (s as { id?: number })?.id === service.id));
      })
      .catch(() => undefined);
  }, [service.id]);

  // Owner viewing their own service — no "contact myself" button. Unauthed viewers are never the
  // owner, so they still see it (and get bounced to sign-in on click, returning here after login).
  const isOwner = authed && myId != null && myId === service.worker;

  const addonsTotal = service.addons
    .filter((a) => picked.includes(a.id))
    .reduce((sum, a) => sum + Number(a.price), 0);
  const total = (Number(service.base_price) + addonsTotal) * qty;

  async function toggleFav() {
    if (!tokens.access) return router.push(signinHereHref());
    if (favBusy) return;
    setFavBusy(true);
    const next = !fav;
    try {
      await api(`/me/favorites/${service.id}`, { method: next ? "PUT" : "DELETE" });
      setFav(next);  // only reflect the change once the server confirms it
    } catch {
      /* keep the previous state on failure (no optimistic desync) */
    } finally {
      setFavBusy(false);
    }
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
      // reset so the user can't immediately re-submit the same order
      setQty(1);
      setPicked([]);
      setDesc("");
    } catch (e) {
      setMsg({ ok: false, text: `⚠️ ${apiError(e).message_ar}` });
    } finally {
      setBusy(false);
    }
  }

  // Open (or resurface) a pre-purchase inquiry chat with the freelancer, then jump into the thread.
  // Unauthenticated → sign in first and come back here (the requirement: gate + return to page).
  async function contact() {
    if (!tokens.access) return router.push(signinHereHref());
    if (contactBusy) return;
    setContactBusy(true);
    setMsg(null);
    try {
      const conv = await api<{ id: number }>(`/conversations`, {
        method: "POST",
        body: JSON.stringify({ service_id: service.id }),
      });
      router.push(`/messages/${conv.id}`);  // stay busy — we're navigating away
    } catch (e) {
      setMsg({ ok: false, text: `⚠️ ${apiError(e).message_ar}` });
      setContactBusy(false);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={toggleFav}
          disabled={favBusy}
          className={`grid h-10 w-10 place-content-center rounded-full text-[22px] transition disabled:opacity-50 ${fav ? "bg-danger-t text-danger" : "text-sub hover:bg-danger-t hover:text-danger"}`}
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
                      <input type="checkbox" className="me-2" checked={picked.includes(a.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                      {a.title}
                    </span>
                    <span>{formatUSD(a.price, { signed: true })}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label htmlFor="buybox-qty" className="text-sm text-sub">الكمية</label>
          <input id="buybox-qty" type="number" min={1} className="w-20 field"
            value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
        </div>

        <textarea className="w-full field" rows={3}
          placeholder="تفاصيل طلبك (اختياري)" value={desc} onChange={(e) => setDesc(e.target.value)} />

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-sub">الإجمالي</span>
          <span className="text-2xl font-extrabold text-primary">{formatUSD(total, { decimals: 2 })}</span>
        </div>
        {authed ? (
          <button className="btn-primary w-full" disabled={busy} onClick={buy}>إرسال طلب الشراء</button>
        ) : (
          <button type="button" onClick={() => router.push(signinHereHref())} className="btn-primary block w-full text-center">سجّل الدخول لإرسال الطلب</button>
        )}
        {!isOwner && (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-center text-xs text-sub">لديك سؤال قبل الشراء؟</p>
            <button
              type="button"
              onClick={contact}
              disabled={contactBusy}
              className="btn-secondary flex w-full items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <EnvelopeIcon className="text-[15px]" /> تواصل مع المستقل
            </button>
          </div>
        )}
        <p className="text-xs text-sub">
          يُحجز المبلغ في الضمان عند قبول المستقل ويُحرَّر بعد تسليمك وقبولك للعمل.
        </p>
      </section>
    </>
  );
}

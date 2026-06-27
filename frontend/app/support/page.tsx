"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";

type Ticket = {
  id: number;
  title: string;
  status: string;
  type_name: string;
  created_at: string;
};
type TicketType = { id: number; name_ar: string; is_dispute: boolean };

const ST_LABEL: Record<string, string> = {
  open: "مفتوحة",
  answered: "تم الرد",
  pending: "بانتظار طرف خارجي",
  on_hold: "موقوفة مؤقتًا",
  solved: "محلولة",
  closed: "مغلقة",
};
const ST_CHIP: Record<string, string> = {
  open: "bg-warn-t text-warn",
  answered: "bg-tint text-primary-dark",
  pending: "bg-warn-t text-warn",
  on_hold: "bg-bg text-sub",
  solved: "bg-success-t text-success",
  closed: "bg-bg text-sub",
};

export default function SupportPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [types, setTypes] = useState<TicketType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [typeId, setTypeId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = useCallback(async () => {
    setLoadErr(false);
    try {
      const [t, ty] = await Promise.all([
        api<{ results: Ticket[] }>("/me/tickets"),
        api<{ results: TicketType[] }>("/ticket-types"),
      ]);
      setTickets(t.results);
      setTypes(ty.results.filter((x) => !x.is_dispute)); // disputes are opened from a contract
    } catch {
      // api() already bounces a real 401 to sign-in; only 5xx/network errors reach here.
      setLoadErr(true);
    }
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load();
  }, [load, router]);

  async function create() {
    if (!typeId || !title.trim() || !message.trim()) return;
    setBusy(true);
    setFormErr("");
    try {
      await api("/tickets", {
        method: "POST",
        body: JSON.stringify({ type_id: typeId, title: title.trim(), message: message.trim() }),
      });
      setShowForm(false);
      setTitle("");
      setMessage("");
      setTypeId("");
      await load();
    } catch (e) {
      // keep the form open with the typed values so the user can retry
      setFormErr(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">الدعم</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>

      <button className="btn-primary mt-5" onClick={() => setShowForm((s) => !s)}>
        {showForm ? "إلغاء" : "+ تذكرة جديدة"}
      </button>

      {showForm && (
        <section className="card mt-4 space-y-3">
          <select
            className="w-full field"
            value={typeId}
            onChange={(e) => setTypeId(Number(e.target.value) || "")}
          >
            <option value="">اختر نوع التذكرة…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name_ar}</option>
            ))}
          </select>
          <input
            className="w-full field"
            placeholder="العنوان"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full field"
            rows={4}
            placeholder="اشرح مشكلتك…"
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {formErr && <p className="rounded-m bg-danger-t p-3 text-sm text-danger">⚠️ {formErr}</p>}
          <button className="btn-primary" disabled={busy} onClick={create}>{busy ? "جارٍ الإرسال…" : "إرسال"}</button>
        </section>
      )}

      {loadErr ? (
        <div className="mt-8 rounded-m bg-danger-t p-8 text-center text-danger">
          تعذّر تحميل التذاكر.
          <button type="button" onClick={load} className="ms-2 font-bold underline">إعادة المحاولة</button>
        </div>
      ) : tickets === null ? (
        <p className="mt-10 text-center text-sub">جارٍ التحميل…</p>
      ) : tickets.length === 0 ? (
        <div className="mt-8 rounded-m bg-tint p-8 text-center text-sub">لا تذاكر بعد</div>
      ) : (
        <ul className="mt-6 space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <a href={`/tickets/${t.id}`} className="card flex items-center justify-between gap-3 hover:shadow-md">
                <div className="min-w-0">
                  <p className="truncate font-bold">{t.title}</p>
                  <p className="mt-0.5 text-xs text-sub">{t.type_name}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${ST_CHIP[t.status] ?? "bg-bg text-sub"}`}>{ST_LABEL[t.status] ?? t.status}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

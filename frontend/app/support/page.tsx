"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";

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
  solved: "محلولة",
  closed: "مغلقة",
};
const ST_CHIP: Record<string, string> = {
  open: "bg-warn-t text-warn",
  answered: "bg-tint text-primary-dark",
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

  const load = useCallback(async () => {
    try {
      const [t, ty] = await Promise.all([
        api<{ results: Ticket[] }>("/me/tickets"),
        api<{ results: TicketType[] }>("/ticket-types"),
      ]);
      setTickets(t.results);
      setTypes(ty.results.filter((x) => !x.is_dispute)); // disputes are opened from a contract
    } catch {
      router.replace("/signin");
    }
  }, [router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    load();
  }, [load, router]);

  async function create() {
    if (!typeId || !title.trim() || !message.trim()) return;
    setBusy(true);
    try {
      await api("/tickets", {
        method: "POST",
        body: JSON.stringify({ type_id: typeId, title, message }),
      });
      setShowForm(false);
      setTitle("");
      setMessage("");
      setTypeId("");
      await load();
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
            className="w-full rounded-m border border-line-strong px-3 py-2 text-sm"
            value={typeId}
            onChange={(e) => setTypeId(Number(e.target.value) || "")}
          >
            <option value="">اختر نوع التذكرة…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name_ar}</option>
            ))}
          </select>
          <input
            className="w-full rounded-m border border-line-strong px-3 py-2 text-sm"
            placeholder="العنوان"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded-m border border-line-strong px-3 py-2 text-sm"
            rows={4}
            placeholder="اشرح مشكلتك…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="btn-primary" disabled={busy} onClick={create}>إرسال</button>
        </section>
      )}

      {tickets === null ? (
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
                <span className={`rounded-full px-3 py-1 text-xs ${ST_CHIP[t.status]}`}>{ST_LABEL[t.status]}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

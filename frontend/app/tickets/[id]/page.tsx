"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { LockIcon } from "@/components/icons";

type Reply = { id: number; message: string; is_staff: boolean; created_at: string };
type Ticket = {
  id: number;
  title: string;
  message: string;
  status: string;
  type_name: string;
  resolution_report: string;
  replies: Reply[];
};

const ST_LABEL: Record<string, string> = {
  open: "مفتوحة",
  answered: "تم الرد",
  solved: "محلولة",
  closed: "مغلقة",
};

export default function TicketThreadPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<Ticket | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setT(await api<Ticket>(`/tickets/${id}`));
    } catch {
      router.replace("/support");
    }
  }, [id, router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    load();
  }, [load, router]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(`/tickets/${id}/replies`, { method: "POST", body: JSON.stringify({ message: body }) });
      setBody("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!t) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;
  const closed = t.status === "closed";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <a href="/support" className="text-sm text-primary-dark">← الدعم</a>
        <span className="rounded-full bg-bg px-3 py-1 text-xs text-sub">{ST_LABEL[t.status]}</span>
      </div>
      <h1 className="mt-3 text-2xl font-extrabold">{t.title}</h1>
      <p className="mt-1 text-xs text-sub">{t.type_name}</p>

      <div className="card mt-4 whitespace-pre-wrap text-sm">{t.message}</div>

      <div className="mt-4 space-y-2">
        {t.replies.map((r) => (
          <div key={r.id} className={`flex ${r.is_staff ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${r.is_staff ? "bg-tint text-primary-deep" : "bg-bg"}`}>
              <p className="mb-0.5 text-[10px] text-sub">{r.is_staff ? "فريق الدعم" : "أنت"}</p>
              <p className="whitespace-pre-wrap">{r.message}</p>
            </div>
          </div>
        ))}
      </div>

      {t.resolution_report && (
        <div className="card mt-4 bg-success-t text-sm text-primary-deep">
          <b>تقرير الحل:</b> {t.resolution_report}
        </div>
      )}

      {closed ? (
        <p className="mt-6 flex items-center justify-center gap-1.5 rounded-m bg-bg p-3 text-center text-sm text-sub"><LockIcon className="text-[15px]" /> التذكرة مغلقة</p>
      ) : (
        <div className="mt-6 flex gap-2">
          <input
            className="flex-1 rounded-m border border-line-strong px-3 py-2 text-sm"
            placeholder="اكتب ردًا…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && send()}
          />
          <button className="btn-primary" disabled={busy || !body.trim()} onClick={send}>إرسال</button>
        </div>
      )}
    </main>
  );
}

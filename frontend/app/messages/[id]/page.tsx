"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { sendViaFirestore, subscribeToMessages } from "@/lib/firebaseChat";
import { LockIcon } from "@/components/icons";

type Msg = { id: number | string; body: string; files: unknown[]; sender?: number; mine: boolean; created_at: string };
type Conv = {
  id: number;
  read_only: boolean;
  other: { id: number; name: string; email: string };
};

export default function ThreadPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ conversation: Conv; messages: Msg[] }>(`/conversations/${id}/messages`);
      setConv(res.conversation);
      setMsgs(res.messages);
    } catch {
      router.replace("/messages");
    }
  }, [id, router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    let active = true;
    let unsub: (() => void) | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    (async () => {
      await load(); // conversation metadata (read-only, names) + initial messages via REST
      // Heavy path: stream messages straight from Firestore. Falls back to polling when
      // Firebase isn't configured (dev / FIRESTORE_STUB) — subscribeToMessages returns null.
      unsub = await subscribeToMessages(id, (live) => {
        if (active) setMsgs(live);
      });
      if (!unsub && active) poll = setInterval(load, 8000);
    })();

    return () => {
      active = false;
      unsub?.();
      if (poll) clearInterval(poll);
    };
  }, [id, load, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setErr("");
    const text = body;
    try {
      // Heavy path: write straight to Firestore (the listener echoes it back in real time).
      // If Firebase isn't available, fall back to the REST endpoint + reload.
      const sentLive = await sendViaFirestore(id, text);
      if (!sentLive) {
        await api(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body: text }) });
        await load();
      }
      setBody("");
    } catch (e) {
      setErr(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  if (!conv) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-4 py-4">
      <header className="flex items-center justify-between border-b border-line pb-3">
        <a href="/messages" className="text-sm text-primary-dark">← الرسائل</a>
        <span className="font-bold">{conv.other.name}</span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto py-4">
        {msgs.length === 0 && <p className="mt-10 text-center text-sub">ابدأ المحادثة بإرسال أول رسالة</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                m.mine ? "bg-primary text-white" : "bg-bg text-primary-deep"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`mt-1 text-[10px] ${m.mine ? "text-white/70" : "text-sub"}`}>
                {new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {err && <p className="rounded-m bg-warn-t p-2 text-sm text-warn">{err}</p>}

      {conv.read_only ? (
        <div className="flex items-center justify-center gap-1.5 rounded-m bg-bg p-3 text-center text-sm text-sub">
          <LockIcon className="shrink-0 text-[15px]" /> هذه المحادثة للقراءة فقط (انتهت فترة الضمان أو انتهى سياقها)
        </div>
      ) : (
        <div className="flex gap-2 border-t border-line pt-3">
          <input
            className="flex-1 rounded-m border border-line-strong px-3 py-2 text-sm"
            placeholder="اكتب رسالة…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && send()}
          />
          <button className="btn-primary" disabled={busy || !body.trim()} onClick={send}>
            إرسال
          </button>
        </div>
      )}
    </main>
  );
}

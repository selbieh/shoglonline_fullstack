"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { api, tokens, uploadFile } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import { sendViaFirestore, subscribeToConversation, subscribeToMessages } from "@/lib/firebaseChat";
import { LockIcon } from "@/components/icons";
import ThreadHeader from "@/components/chat/ThreadHeader";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageComposer from "@/components/chat/MessageComposer";
import type { Conversation } from "@/components/chat/types";
import type { ChatAttachment, ChatMessage } from "@/lib/chatFormat";

type RestMsg = {
  id: number | string;
  body: string;
  attachments: { id: number; kind: string; original_name: string; size: number }[];
  mine: boolean;
  created_at: string;
};

function normalizeRest(m: RestMsg): ChatMessage {
  return {
    id: m.id,
    body: m.body,
    mine: m.mine,
    created_at: m.created_at,
    attachments: (m.attachments || []).map((a) => ({
      id: a.id,
      kind: a.kind as ChatAttachment["kind"],
      name: a.original_name,
      size: a.size,
    })),
  };
}

export default function ThreadPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [reads, setReads] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(false); // true once Firestore is streaming (so REST reloads don't fight it)
  const lastSeen = useRef<string | number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ conversation: Conversation; messages: RestMsg[] }>(`/conversations/${id}/messages`);
      setConv(res.conversation);
      if (!liveRef.current) setMsgs(res.messages.map(normalizeRest));
    } catch {
      router.replace("/messages");
    }
  }, [id, router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    let active = true;
    let unsubMsgs: (() => void) | null = null;
    let unsubConv: (() => void) | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    (async () => {
      await load(); // metadata (read-only, names, context) + initial messages via REST
      // Heavy path: stream messages + read receipts from Firestore. Falls back to polling when
      // Firebase isn't configured (dev / FIRESTORE_STUB) — the subscribe fns return null.
      const um = await subscribeToMessages(id, (live) => {
        if (!active) return;
        liveRef.current = true;
        setMsgs(live.map((m) => ({ id: m.id, body: m.body, mine: m.mine, created_at: m.created_at, attachments: m.attachments })));
      });
      // Unmounted while the subscribe promise was in flight → tear down immediately so the
      // Firestore listener doesn't leak (cleanup already ran with a null unsub ref).
      if (!active) { um?.(); return; }
      unsubMsgs = um;

      const uc = await subscribeToConversation(id, (info) => {
        if (active) setReads(info.reads);
      });
      if (!active) { uc?.(); return; }
      unsubConv = uc;

      if (!unsubMsgs) poll = setInterval(load, 8000);
    })();

    return () => {
      active = false;
      unsubMsgs?.();
      unsubConv?.();
      if (poll) clearInterval(poll);
    };
  }, [id, load, router]);

  // Scroll to the newest message; re-mark read when a fresh not-mine message lands while focused
  // (so the other party's ✓✓ updates live — the initial GET already marked read on open).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    const last = msgs[msgs.length - 1];
    if (last && !last.mine && last.id !== lastSeen.current) {
      lastSeen.current = last.id;
      api(`/conversations/${id}/read`, { method: "POST" }).catch(() => {});
    }
  }, [msgs, id]);

  async function sendText(text: string) {
    setErr("");
    try {
      // Plain text → fast client-write path; REST fallback when Firestore is unavailable.
      const sentLive = await sendViaFirestore(id, text);
      if (!sentLive) {
        await api(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body: text }) });
        await load();
      }
    } catch (e) {
      setErr(apiError(e).message_ar);
    }
  }

  async function sendFile(file: File) {
    setErr("");
    try {
      // Attachments ALWAYS go via REST so the backend links them synchronously and mirrors the
      // message (with attachment metadata) to Firestore — avoids the download-before-linked race.
      const att = await uploadFile(file);
      await api(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ attachment_ids: [att.id] }) });
      if (!liveRef.current) await load();
    } catch (e) {
      setErr(apiError(e).message_ar);
    }
  }

  if (!conv) {
    return <div className="grid h-full w-full place-content-center rounded-l border border-line bg-white text-sub">جارٍ التحميل…</div>;
  }

  const otherRead = reads[String(conv.other.id)] ? new Date(reads[String(conv.other.id)]).getTime() : 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-l border border-line bg-white">
      <ThreadHeader conv={conv} />

      <div className="flex-1 space-y-3 overflow-y-auto bg-bg p-4">
        <div className="mx-auto max-w-md rounded-m bg-tint/60 px-3 py-2 text-center text-[11px] leading-relaxed text-primary-dark">
          إن لم تُقرأ رسالتك خلال 10 دقائق نُرسل للطرف الآخر بريدًا تلقائيًا برابط المحادثة — مرة واحدة لكل رسالة.
        </div>
        {msgs.length === 0 && <p className="mt-10 text-center text-sub">ابدأ المحادثة بإرسال أول رسالة</p>}
        {msgs.map((m) => (
          <MessageBubble
            key={m.id}
            m={m}
            otherName={conv.other.name}
            otherAvatar={conv.other.avatar}
            readByOther={m.mine && otherRead > 0 && new Date(m.created_at).getTime() <= otherRead}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {err && <p className="border-t border-line bg-warn-t p-2 text-center text-sm text-warn">{err}</p>}

      {conv.read_only ? (
        <div className="flex items-center justify-center gap-1.5 border-t border-line bg-bg p-4 text-center text-sm text-sub">
          <LockIcon className="shrink-0 text-[15px]" /> هذه المحادثة للقراءة فقط (انتهت فترة الضمان أو انتهى سياقها)
        </div>
      ) : (
        <MessageComposer onSendText={sendText} onSendFile={sendFile} />
      )}
    </div>
  );
}

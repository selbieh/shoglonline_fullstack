/**
 * Firestore chat client — the heavy real-time path.
 *
 * The backend is the control plane: `POST /chat/token` returns a per-user Firebase custom token
 * (our identity in Firestore) plus the public web config. We sign into Firebase with it, then
 * read/write messages DIRECTLY against Firestore — security rules (which the backend's data shape
 * defines) enforce membership, sender-only writes, and the read-only lifecycle.
 *
 * Dev fallback: when the backend runs with FIRESTORE_STUB (no Firebase project), `/chat/token`
 * returns `{ stub: true }`. Every function here then degrades to "not real-time" so the caller
 * keeps the REST + polling path — the app works with or without Firebase configured.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

import { api } from "./api";
import type { ChatAttachment } from "./chatFormat";

type ChatConfig = { token: string; projectId: string; apiKey: string; stub: boolean };

export type LiveMessage = {
  id: string;
  body: string;
  attachments: ChatAttachment[];
  mine: boolean;
  created_at: string;
};

/** Conversation-doc live state: the per-user read cursors (for ✓✓) + lifecycle status. */
export type ConvLive = { reads: Record<string, string>; status: string };

type Ready = { db: Firestore; uid: string };

let readyPromise: Promise<Ready | null> | null = null;

async function connect(): Promise<Ready | null> {
  let cfg: ChatConfig;
  try {
    cfg = await api<ChatConfig>("/chat/token", { method: "POST" });
  } catch {
    return null;
  }
  // dev / not-configured → caller uses the REST polling fallback
  if (cfg.stub || !cfg.apiKey || !cfg.projectId) return null;

  const app: FirebaseApp = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: cfg.apiKey,
        projectId: cfg.projectId,
        authDomain: `${cfg.projectId}.firebaseapp.com`,
      });
  const credential = await signInWithCustomToken(getAuth(app), cfg.token);
  return { db: getFirestore(app), uid: credential.user.uid };
}

/** Cached so we sign into Firebase once per session. A failed/stubbed connect is NOT pinned
 * forever — we clear the cache on a null result so a later attempt can recover real-time. */
export function getChat(): Promise<Ready | null> {
  if (!readyPromise) {
    readyPromise = connect().catch(() => null);
    readyPromise.then((ready) => {
      if (!ready) readyPromise = null; // allow a retry next call (transient /chat/token failure)
    });
  }
  return readyPromise;
}

/** True when a real Firestore connection is available (vs. the dev REST fallback). */
export async function isRealtime(): Promise<boolean> {
  return (await getChat()) !== null;
}

function toIso(createdAt: unknown): string {
  const ts = createdAt as { toDate?: () => Date } | null;
  return ts?.toDate ? ts.toDate().toISOString() : new Date().toISOString();
}

/**
 * Subscribe to a conversation's messages in real time.
 * Returns an unsubscribe fn, or `null` when Firestore isn't available (caller should poll).
 */
export async function subscribeToMessages(
  conversationId: string | number,
  onMessages: (messages: LiveMessage[]) => void,
): Promise<(() => void) | null> {
  const chat = await getChat();
  if (!chat) return null;

  const q = query(
    collection(chat.db, "conversations", String(conversationId), "messages"),
    orderBy("createdAt"),
  );
  return onSnapshot(q, (snap) => {
    const messages: LiveMessage[] = snap.docs.map((d) => {
      const data = d.data() as { sender: string; body?: string; files?: ChatAttachment[]; createdAt?: unknown };
      return {
        id: d.id,
        body: data.body ?? "",
        attachments: Array.isArray(data.files) ? data.files : [],
        mine: data.sender === chat.uid,
        created_at: toIso(data.createdAt),
      };
    });
    onMessages(messages);
  });
}

/**
 * Subscribe to the conversation DOCUMENT (not the messages subcollection) for the `reads` map —
 * each participant's last-read timestamp, written by the backend `mark_read` mirror. The sender
 * derives ✓ (sent) vs ✓✓ (read) by comparing the other party's read time to each message's time.
 * Returns null when Firestore isn't available (receipts are a real-time-only feature).
 */
export async function subscribeToConversation(
  conversationId: string | number,
  onUpdate: (info: ConvLive) => void,
): Promise<(() => void) | null> {
  const chat = await getChat();
  if (!chat) return null;
  const ref = doc(chat.db, "conversations", String(conversationId));
  return onSnapshot(ref, (snap) => {
    const data = (snap.data() ?? {}) as { reads?: Record<string, unknown>; status?: string };
    const reads: Record<string, string> = {};
    for (const [uid, ts] of Object.entries(data.reads ?? {})) reads[uid] = toIso(ts);
    onUpdate({ reads, status: data.status ?? "active" });
  });
}

/**
 * Write a message straight to Firestore (heavy path). Returns false when Firestore isn't
 * available so the caller can fall back to the REST endpoint. Security rules reject the write
 * if the conversation is read-only or the sender isn't a participant.
 */
export async function sendViaFirestore(conversationId: string | number, body: string): Promise<boolean> {
  const chat = await getChat();
  if (!chat) return false;
  await addDoc(collection(chat.db, "conversations", String(conversationId), "messages"), {
    sender: chat.uid,
    body,
    files: [],
    createdAt: serverTimestamp(),
  });
  return true;
}

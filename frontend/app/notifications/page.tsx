"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { GearIcon } from "@/components/icons";

type Note = {
  id: number;
  kind: string;
  title: string;
  body: string;
  deep_link: string;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[] | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ results: Note[] }>("/me/notifications");
    setNotes(res.results);
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load().catch(() => router.replace(signinHereHref()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markOne(note: Note) {
    if (!note.is_read) {
      await api(`/notifications/${note.id}/read`, { method: "POST" }).catch(() => undefined);
      setNotes((prev) => prev?.map((n) => (n.id === note.id ? { ...n, is_read: true } : n)) ?? null);
    }
    if (note.deep_link) router.push(note.deep_link);
  }

  async function markAll() {
    await api("/me/notifications/read-all", { method: "POST" }).catch(() => undefined);
    setNotes((prev) => prev?.map((n) => ({ ...n, is_read: true })) ?? null);
  }

  if (!notes) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  const unread = notes.filter((n) => !n.is_read).length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">الإشعارات</h1>
        <div className="flex items-center gap-4">
          {unread > 0 && (
            <button onClick={markAll} className="text-sm text-primary-dark">تعليم الكل كمقروء</button>
          )}
          <a href="/settings" className="inline-flex items-center gap-1 text-sm text-sub hover:text-primary"><GearIcon className="text-[15px]" /> تفضيلات الإشعارات</a>
          <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
        </div>
      </div>

      <ul className="mt-6 space-y-2">
        {notes.length === 0 && (
          <li className="card text-center text-sub">لا إشعارات بعد</li>
        )}
        {notes.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => markOne(n)}
              className={`block w-full rounded-m border p-4 text-right transition hover:border-primary ${
                n.is_read ? "border-line bg-white" : "border-primary/30 bg-tint"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{n.title}</p>
                {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />}
              </div>
              {n.body && <p className="mt-1 text-sm text-sub">{n.body}</p>}
              <p className="mt-1 text-xs text-sub">{new Date(n.created_at).toLocaleString("ar")}</p>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { BellIcon } from "@/components/icons";

type Note = {
  id: number;
  kind: string;
  title: string;
  body: string;
  deep_link: string;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await api<{ unread: number }>("/me/notifications/unread-count");
      setUnread(res.unread);
    } catch {
      /* not signed in / transient — ignore */
    }
  }, []);

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 20000);
    return () => clearInterval(t);
  }, [loadCount]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        const res = await api<{ results: Note[] }>("/me/notifications");
        setNotes(res.results);
      } catch {
        /* ignore */
      }
    }
  }

  async function markAll() {
    await api("/me/notifications/read-all", { method: "POST" }).catch(() => undefined);
    setUnread(0);
    setNotes((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  // Mark a single notification read on click so its badge/highlight clears immediately
  // instead of waiting for the next 20s poll.
  function markOne(n: Note) {
    if (n.is_read) return;
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative grid h-9 w-9 place-content-center rounded-full text-[20px] text-sub transition hover:bg-tint hover:text-primary"
        aria-label="الإشعارات"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -left-0.5 -top-0.5 grid h-4 min-w-4 place-content-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-80 rounded-m border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span className="font-bold">الإشعارات</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-primary-dark">
                تعليم الكل كمقروء
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {notes.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-sub">لا إشعارات</li>
            ) : (
              notes.map((n) => (
                <li key={n.id} className={`border-b border-line ${n.is_read ? "" : "bg-tint"}`}>
                  <a href={n.deep_link || "#"} onClick={() => markOne(n)} className="block px-4 py-2.5 hover:bg-bg">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="mt-0.5 truncate text-xs text-sub">{n.body}</p>}
                    <p className="mt-0.5 text-[10px] text-sub">{new Date(n.created_at).toLocaleString("ar-u-nu-latn")}</p>
                  </a>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

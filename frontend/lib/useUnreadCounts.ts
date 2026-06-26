"use client";

import { useEffect, useState } from "react";
import { api, tokens } from "@/lib/api";

type Conversation = { unread: number };

/**
 * Polls the unread badges for the header icons: notifications (a dedicated
 * count endpoint) and messages (summed across the conversation list, since
 * there's no aggregate endpoint). Refreshes every 20s and pauses while the
 * tab is hidden. Returns 0/0 when signed out or on transient errors.
 */
export function useUnreadCounts() {
  const [notifications, setNotifications] = useState(0);
  const [messages, setMessages] = useState(0);

  useEffect(() => {
    if (!tokens.access) return;
    let alive = true;

    async function load() {
      if (document.hidden) return;
      try {
        const res = await api<{ unread: number }>("/me/notifications/unread-count");
        if (alive) setNotifications(res.unread);
      } catch {
        /* signed out / transient — keep last value */
      }
      try {
        const res = await api<{ results: Conversation[] }>("/me/conversations");
        if (alive) setMessages(res.results.reduce((sum, c) => sum + (c.unread || 0), 0));
      } catch {
        /* ignore */
      }
    }

    load();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return { notifications, messages };
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { SearchIcon } from "@/components/icons";
import { matchesFilter, type ConvFilter } from "@/lib/chatFormat";
import ConversationItem from "./ConversationItem";
import type { Conversation } from "./types";

type Sort = "recent" | "unread";

function FilterPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
        active ? "bg-primary text-white" : "bg-bg text-sub hover:bg-tint"
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`grid h-4 min-w-4 place-content-center rounded-full px-1 text-[10px] ${active ? "bg-white/25" : "bg-primary/15 text-primary-dark"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border-b-2 py-2.5 text-sm font-semibold transition ${
        active ? "border-primary text-primary-dark" : "border-transparent text-sub hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Left sidebar (RTL: right) — search, filter pills, current/archive tabs, sort, conversation rows.
 * Lives in the messages layout so it persists (and keeps its state) while navigating threads. */
export default function ConversationList({ activeId }: { activeId: number | null }) {
  const router = useRouter();
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ConvFilter>("all");
  const [tab, setTab] = useState<"current" | "archive">("current");
  const [sort, setSort] = useState<Sort>("recent");

  const load = useCallback(async () => {
    try {
      const res = await api<{ results: Conversation[] }>("/me/conversations");
      setConvs(res.results);
    } catch {
      router.replace(signinHereHref());
    }
  }, [router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load();
    const t = setInterval(load, 15000); // light refresh so previews/unread stay current
    return () => clearInterval(t);
  }, [load, router]);

  // Filter-pill counts reflect the CURRENT (non-archived) set, like the mockup badges.
  const counts = useMemo(() => {
    const cur = (convs ?? []).filter((c) => !c.read_only);
    return {
      all: cur.length,
      jobs: cur.filter((c) => matchesFilter(c.context_type, "jobs")).length,
      services: cur.filter((c) => matchesFilter(c.context_type, "services")).length,
    };
  }, [convs]);

  const shown = useMemo(() => {
    let list = (convs ?? []).filter((c) => (tab === "archive" ? c.read_only : !c.read_only));
    list = list.filter((c) => matchesFilter(c.context_type, filter));
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (c) =>
          c.other.name.toLowerCase().includes(needle) ||
          (c.last_message_snippet || "").toLowerCase().includes(needle) ||
          (c.context?.title || "").toLowerCase().includes(needle),
      );
    }
    if (sort === "unread") list = [...list].sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0));
    return list; // "recent" keeps the backend's -last_message_at ordering
  }, [convs, tab, filter, q, sort]);

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-l border border-line bg-white md:w-[340px] md:shrink-0">
      <div className="border-b border-line p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sub" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="البحث في المحادثات"
            className="w-full rounded-m border border-line bg-bg py-2.5 pr-9 pl-3 text-sm text-ink placeholder:text-sub/60 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2 border-b border-line px-3 py-2">
        <FilterPill active={filter === "all"} onClick={() => setFilter("all")} label="الكل" count={counts.all} />
        <FilterPill active={filter === "jobs"} onClick={() => setFilter("jobs")} label="الوظائف" count={counts.jobs} />
        <FilterPill active={filter === "services"} onClick={() => setFilter("services")} label="الخدمات" count={counts.services} />
      </div>

      <div className="flex border-b border-line">
        <TabBtn active={tab === "current"} onClick={() => setTab("current")}>الرسائل الحالية</TabBtn>
        <TabBtn active={tab === "archive"} onClick={() => setTab("archive")}>الأرشيف</TabBtn>
      </div>

      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs text-sub">
        <label htmlFor="conv-sort">ترتيب حسب</label>
        <select
          id="conv-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-m border border-line bg-white px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
        >
          <option value="recent">الأحدث</option>
          <option value="unread">غير المقروءة</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {convs === null ? (
          <p className="p-6 text-center text-sm text-sub">جارٍ التحميل…</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-sub">{tab === "archive" ? "لا محادثات مؤرشفة" : "لا محادثات بعد"}</p>
        ) : (
          shown.map((c) => <ConversationItem key={c.id} conv={c} active={c.id === activeId} />)
        )}
      </div>
    </aside>
  );
}

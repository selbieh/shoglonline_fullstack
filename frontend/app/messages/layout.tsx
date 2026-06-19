"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import ConversationList from "@/components/chat/ConversationList";

/**
 * Two-panel chat shell (RTL): the conversation list sits beside the active thread. The list lives
 * in the layout so it persists — and keeps its search/filter/scroll state — while navigating between
 * threads. On mobile only one panel shows: the list on /messages, the thread on /messages/[id].
 */
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const seg = useSelectedLayoutSegment();
  const activeId = seg && /^\d+$/.test(seg) ? Number(seg) : null;
  const onThread = activeId !== null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <div className="flex h-[calc(100vh-160px)] min-h-[520px] gap-4">
        <div className={`${onThread ? "hidden md:flex" : "flex"} w-full md:w-auto`}>
          <ConversationList activeId={activeId} />
        </div>
        <div className={`${onThread ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>{children}</div>
      </div>
    </main>
  );
}

import Avatar from "@/components/Avatar";
import { LockIcon } from "@/components/icons";
import { CTX_LABEL, relativeTime } from "@/lib/chatFormat";
import type { Conversation } from "./types";

/** One row in the conversation list: avatar, context tag, name, last-message preview, time, unread. */
export default function ConversationItem({ conv, active }: { conv: Conversation; active: boolean }) {
  const ctxTitle = conv.context?.title;
  return (
    <a
      href={`/messages/${conv.id}`}
      className={`flex gap-3 border-b border-line px-4 py-3 transition ${
        active ? "bg-tint" : "hover:bg-bg"
      } ${conv.read_only ? "opacity-70" : ""}`}
    >
      <Avatar name={conv.other.name} src={conv.other.avatar || null} className="h-11 w-11 shrink-0" textClassName="text-sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-primary-dark">
            {CTX_LABEL[conv.context_type] || "محادثة"}
            {ctxTitle ? ` · ${ctxTitle}` : ""}
          </span>
          <span className="shrink-0 text-[11px] text-sub">{relativeTime(conv.last_message_at)}</span>
        </div>
        <b className="mt-1 block truncate text-sm text-ink">{conv.other.name}</b>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1 text-xs text-sub">
            {conv.read_only && <LockIcon className="shrink-0 text-[11px]" />}
            <span className="truncate">{conv.last_message_snippet || "—"}</span>
          </p>
          {conv.unread > 0 && (
            <span className="grid h-5 min-w-5 shrink-0 place-content-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
              {conv.unread}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

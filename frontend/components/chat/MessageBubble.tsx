import Avatar from "@/components/Avatar";
import { clockTime, type ChatMessage } from "@/lib/chatFormat";
import AttachmentView from "./AttachmentView";
import ReadReceipt from "./ReadReceipt";

/** A single message row. Sent (mine) → periwinkle on the end (left in RTL); received → light on the
 * start (right) with the sender's avatar. Mirrors the design's `.bubble.out` / `.bubble.in`. */
export default function MessageBubble({
  m,
  otherName,
  otherAvatar,
  readByOther,
}: {
  m: ChatMessage;
  otherName: string;
  otherAvatar: string;
  readByOther: boolean;
}) {
  return (
    <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
      <div className="flex max-w-[80%] items-end gap-2">
        {!m.mine && (
          <Avatar name={otherName} src={otherAvatar || null} className="h-7 w-7 shrink-0" textClassName="text-[10px]" />
        )}
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${m.mine ? "bg-primary text-white" : "border border-line bg-white text-ink"}`}>
          {m.attachments.length > 0 && (
            <div className="mb-1 flex flex-col gap-1.5">
              {m.attachments.map((a) => (
                <AttachmentView key={a.id} att={a} mine={m.mine} />
              ))}
            </div>
          )}
          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
          <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${m.mine ? "text-white/70" : "text-sub"}`}>
            <span>{clockTime(m.created_at)}</span>
            {m.mine && <ReadReceipt read={readByOther} />}
          </div>
        </div>
      </div>
    </div>
  );
}

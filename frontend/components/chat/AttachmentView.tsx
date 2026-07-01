"use client";

import { useState } from "react";

import { DocumentIcon, VideoIcon } from "@/components/icons";
import { fmtSize, type ChatAttachment } from "@/lib/chatFormat";
import { useAttachmentUrl } from "@/lib/useAttachmentUrl";
import AudioPlayer from "./AudioPlayer";

function ImageAttachment({ att, mine }: { att: ChatAttachment; mine: boolean }) {
  const { url, loading, error } = useAttachmentUrl(att.id);
  if (error) return <FileChip att={att} mine={mine} />;
  if (loading || !url) return <div className="h-40 w-40 animate-pulse rounded-m bg-black/10" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={att.name} className="max-h-60 max-w-full rounded-m object-cover" />
    </a>
  );
}

/** Video is click-to-load: blob-streaming a large file eagerly would buffer it all into memory. */
function VideoAttachment({ att, mine }: { att: ChatAttachment; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const { url, loading } = useAttachmentUrl(att.id, open);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-m border px-3 py-2 text-xs ${
          mine ? "border-white/30 bg-white/10 text-white" : "border-line bg-white text-ink"
        }`}
      >
        <VideoIcon className="shrink-0 text-[16px]" /> تشغيل الفيديو · {fmtSize(att.size)}
      </button>
    );
  }
  if (loading || !url) return <div className="grid h-40 w-full place-content-center rounded-m bg-black/10 text-xs text-sub">جارٍ التحميل…</div>;
  return <video src={url} controls className="max-h-72 max-w-full rounded-m" />;
}

function FileChip({ att, mine }: { att: ChatAttachment; mine: boolean }) {
  const { url, error } = useAttachmentUrl(att.id);
  // Distinct failed state — otherwise a download error (expired token, deleted upload) renders
  // identically to the still-loading state (greyed, non-clickable) and looks like it loads forever.
  if (error) {
    return (
      <span
        className={`inline-flex max-w-full items-center gap-2 rounded-m border px-3 py-2 text-xs ${
          mine ? "border-white/30 bg-white/10 text-white" : "border-line bg-white text-ink"
        }`}
      >
        <DocumentIcon className="shrink-0 text-[16px]" />
        <span className="truncate">{att.name}</span>
        <span className="shrink-0 opacity-70">تعذّر تحميل الملف</span>
      </span>
    );
  }
  return (
    <a
      href={url || undefined}
      download={att.name}
      className={`inline-flex max-w-full items-center gap-2 rounded-m border px-3 py-2 text-xs ${
        mine ? "border-white/30 bg-white/10 text-white" : "border-line bg-white text-ink"
      } ${url ? "" : "pointer-events-none opacity-60"}`}
    >
      <DocumentIcon className="shrink-0 text-[16px]" />
      <span className="truncate">{att.name}</span>
      <span className="shrink-0 opacity-70">{fmtSize(att.size)}</span>
    </a>
  );
}

/** Render one message attachment by kind: voice pill, image, click-to-load video, or file chip. */
export default function AttachmentView({ att, mine }: { att: ChatAttachment; mine: boolean }) {
  if (att.kind === "audio") return <AudioPlayer id={att.id} mine={mine} />;
  if (att.kind === "image") return <ImageAttachment att={att} mine={mine} />;
  if (att.kind === "video") return <VideoAttachment att={att} mine={mine} />;
  return <FileChip att={att} mine={mine} />;
}

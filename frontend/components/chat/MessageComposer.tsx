"use client";

import { useRef, useState } from "react";

import { DocumentIcon, ImageIcon, MicIcon, PlusIcon, SendIcon, VideoIcon } from "@/components/icons";
import VoiceRecorder from "./VoiceRecorder";

// Client-side guards mirroring backend uploads settings (apps/core/services.py): a fast pre-check
// before onSendFile uploads — the server stays the source of truth.
const MAX_FILE_MB = 25; // uploads.max_file_mb
const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav", "audio/mp4", "audio/x-m4a",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip", "application/x-zip-compressed",
  "application/x-rar-compressed", "application/vnd.rar",
  "text/plain",
];
const ACCEPT = ALLOWED_MIME.join(",");

function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-ink transition hover:bg-tint"
    >
      <span className="grid h-7 w-7 place-content-center rounded-m bg-tint text-primary-dark">{icon}</span>
      {label}
    </button>
  );
}

/** Composer: + attachment menu (صورة/فيديو/ملف), mic recorder, text field, send. */
export default function MessageComposer({
  onSendText,
  onSendFile,
}: {
  onSendText: (text: string) => Promise<void> | void;
  onSendFile: (file: File) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSendText(t);
      setText(""); // clear only after a successful send so a failure doesn't lose the message
    } catch {
      // keep the typed text so the user can retry
    } finally {
      setBusy(false);
    }
  }

  function pick(ref: React.RefObject<HTMLInputElement>) {
    if (busy) return;
    setMenuOpen(false);
    ref.current?.click();
  }

  async function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || busy) return;
    if (!ALLOWED_MIME.includes(f.type)) {
      setError(`نوع الملف «${f.name}» غير مسموح`);
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`حجم «${f.name}» يتجاوز ${MAX_FILE_MB}MB`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSendFile(f);
    } finally {
      setBusy(false);
    }
  }

  if (recording) {
    return (
      <VoiceRecorder
        onCancel={() => setRecording(false)}
        onSend={async (file) => {
          setRecording(false);
          setBusy(true);
          try {
            await onSendFile(file);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="border-t border-line">
      {error && <p role="alert" className="px-3 pt-2 text-sm text-danger">{error}</p>}
      <div className="relative flex items-center gap-2 px-3 py-2.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => !busy && setMenuOpen((v) => !v)}
          disabled={busy}
          aria-label="إرفاق"
          className="grid h-9 w-9 place-content-center rounded-full bg-tint text-primary-dark transition hover:bg-primary hover:text-white disabled:opacity-40"
        >
          <PlusIcon className="text-[18px]" />
        </button>
        {menuOpen && (
          <>
            <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-12 right-0 z-20 w-36 overflow-hidden rounded-m border border-line bg-white shadow-card">
              <MenuRow icon={<ImageIcon className="text-[16px]" />} label="صورة" onClick={() => pick(imgRef)} />
              <MenuRow icon={<VideoIcon className="text-[16px]" />} label="فيديو" onClick={() => pick(vidRef)} />
              <MenuRow icon={<DocumentIcon className="text-[16px]" />} label="ملف" onClick={() => pick(fileRef)} />
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setRecording(true)}
        disabled={busy}
        aria-label="تسجيل صوتي"
        className="grid h-9 w-9 place-content-center rounded-full bg-tint text-primary-dark transition hover:bg-primary hover:text-white disabled:opacity-40"
      >
        <MicIcon className="text-[18px]" />
      </button>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Don't send on the Enter that confirms an IME composition (Arabic/CJK input methods).
          if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
        }}
        placeholder="اكتب رسالتك.."
        className="flex-1 rounded-full border border-line bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-sub/60 focus:border-primary focus:outline-none"
      />

      <button
        type="button"
        onClick={submit}
        disabled={busy || !text.trim()}
        aria-label="إرسال"
        className="grid h-10 w-10 shrink-0 place-content-center rounded-full bg-primary text-white transition disabled:opacity-40"
      >
        <SendIcon className="text-[18px]" />
      </button>

      <input ref={imgRef} type="file" accept="image/*" hidden onChange={onPicked} />
      <input ref={vidRef} type="file" accept="video/*" hidden onChange={onPicked} />
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onPicked} />
      </div>
    </div>
  );
}

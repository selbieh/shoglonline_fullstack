"use client";

import { useRef, useState } from "react";

import { DocumentIcon, ImageIcon, MicIcon, PlusIcon, SendIcon, VideoIcon } from "@/components/icons";
import VoiceRecorder from "./VoiceRecorder";

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
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    setBusy(true);
    try {
      await onSendText(t);
    } finally {
      setBusy(false);
    }
  }

  function pick(ref: React.RefObject<HTMLInputElement>) {
    setMenuOpen(false);
    ref.current?.click();
  }

  async function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
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
    <div className="relative flex items-center gap-2 border-t border-line px-3 py-2.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="إرفاق"
          className="grid h-9 w-9 place-content-center rounded-full bg-tint text-primary-dark transition hover:bg-primary hover:text-white"
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
        aria-label="تسجيل صوتي"
        className="grid h-9 w-9 place-content-center rounded-full bg-tint text-primary-dark transition hover:bg-primary hover:text-white"
      >
        <MicIcon className="text-[18px]" />
      </button>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
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
      <input ref={fileRef} type="file" hidden onChange={onPicked} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { SendIcon, TrashIcon } from "@/components/icons";
import { fmtDuration } from "@/lib/chatFormat";

const WAVE = "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px)";

/** Pick the best-supported recording container. We prefer mp4/ogg (unambiguously audio); on Chrome
 * only webm is available — the backend reconciles audio/webm so it still classifies as a voice note. */
function pickMime(): { mime: string; ext: string } {
  const candidates = [
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    { mime: "audio/ogg", ext: "ogg" },
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "", ext: "webm" };
}

/** Inline recording bar (replaces the composer while active): timer + waveform + delete/send. */
export default function VoiceRecorder({ onSend, onCancel }: { onSend: (f: File) => void | Promise<void>; onCancel: () => void }) {
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeRef = useRef(pickMime());
  const sendOnStop = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const { mime } = mimeRef.current;
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recRef.current = rec;
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          if (!sendOnStop.current) {
            onCancel();
            return;
          }
          const type = mimeRef.current.mime.split(";")[0] || "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          const file = new File([blob], `voice-${new Date().getTime()}.${mimeRef.current.ext}`, { type });
          await onSend(file);
        };
        rec.start();
        timer = setInterval(() => setSecs((s) => s + 1), 1000);
      } catch {
        setError("تعذّر الوصول إلى الميكروفون");
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish(send: boolean) {
    sendOnStop.current = send;
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // onstop handles send/cancel
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCancel();
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
      <button
        type="button"
        onClick={() => finish(false)}
        aria-label="حذف التسجيل"
        className="grid h-10 w-10 shrink-0 place-content-center rounded-full bg-danger-t text-danger"
      >
        <TrashIcon className="text-[18px]" />
      </button>
      {error ? (
        <span className="flex-1 text-sm text-danger">{error}</span>
      ) : (
        <div className="flex flex-1 items-center gap-2 rounded-full bg-tint px-4 py-2 text-primary-dark">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger" />
          <span className="shrink-0 text-xs tabular-nums">{fmtDuration(secs)}</span>
          <div className="h-3 flex-1 rounded-full opacity-40" style={{ backgroundImage: WAVE }} />
        </div>
      )}
      <button
        type="button"
        onClick={() => finish(true)}
        disabled={!!error}
        aria-label="إرسال التسجيل"
        className="grid h-10 w-10 shrink-0 place-content-center rounded-full bg-primary text-white disabled:opacity-40"
      >
        <SendIcon className="text-[18px]" />
      </button>
    </div>
  );
}

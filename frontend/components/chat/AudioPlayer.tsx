"use client";

import { useRef, useState } from "react";

import { PauseIcon, PlayIcon } from "@/components/icons";
import { fmtDuration } from "@/lib/chatFormat";
import { useAttachmentUrl } from "@/lib/useAttachmentUrl";

const WAVE = "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px)";

/** Voice-note pill: play/pause + faux waveform with progress + duration. */
export default function AudioPlayer({ id, mine }: { id: number; mine: boolean }) {
  const { url, loading } = useAttachmentUrl(id);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play();
  }

  const pct = dur > 0 && Number.isFinite(dur) ? Math.min(100, (cur / dur) * 100) : 0;
  const time = Number.isFinite(dur) && dur > 0 ? fmtDuration(playing ? cur : dur) : fmtDuration(cur);

  return (
    <div
      className={`flex min-w-[190px] items-center gap-2 rounded-full px-2 py-1.5 ${
        mine ? "bg-white/15 text-white" : "bg-tint text-primary-dark"
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={loading || !url}
        aria-label={playing ? "إيقاف" : "تشغيل"}
        className={`grid h-8 w-8 shrink-0 place-content-center rounded-full ${
          mine ? "bg-white/25 text-white" : "bg-primary text-white"
        } disabled:opacity-50`}
      >
        {playing ? <PauseIcon className="text-[14px]" /> : <PlayIcon className="text-[13px]" />}
      </button>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full">
        <div className="absolute inset-0 opacity-35" style={{ backgroundImage: WAVE }} />
        <div className="absolute inset-y-0 right-0" style={{ width: `${pct}%`, backgroundImage: WAVE }} />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums">{time}</span>
      <audio
        ref={ref}
        src={url || undefined}
        hidden
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCur(0);
        }}
      />
    </div>
  );
}

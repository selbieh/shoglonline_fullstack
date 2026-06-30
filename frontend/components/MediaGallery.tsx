"use client";

import { useEffect, useState } from "react";

/* Hero image + thumbnail strip with prev/next + dots (ppt slides 20/21/22 work-showcase carousel).
   RTL: the «‹» control advances toward the start. Falls back gracefully to a single image.
   Clicking the hero opens an animated full-view lightbox modal. */

export default function MediaGallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  // URLs that fail to load (e.g. dead legacy links that 403/404) are dropped so a broken <img> never
  // shows — the gallery degrades to the elegant placeholder instead of an empty frame.
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const markBroken = (src: string) => setBroken((s) => (s.has(src) ? s : new Set(s).add(src)));

  const live = (images ?? []).filter((src) => src && !broken.has(src));
  if (live.length === 0) {
    return <MediaPlaceholder />;
  }
  const idx = i % live.length;
  const cur = live[idx];
  const go = (d: number) => setI((p) => (p + d + live.length) % live.length);
  const many = live.length > 1;

  return (
    <div>
      <div className="relative h-[clamp(200px,30vh,340px)] overflow-hidden rounded-l border border-line bg-tint">
        {/* soft blurred backdrop fills the frame so any aspect ratio (logo, portrait, wide) looks elegant */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cur} alt="" aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cur} alt={alt}
          className="relative h-full w-full cursor-zoom-in object-contain transition-transform duration-300 hover:scale-[1.02]"
          onClick={() => setOpen(true)}
          onError={() => markBroken(cur)} />
        {/* zoom hint */}
        <button type="button" onClick={() => setOpen(true)} aria-label="عرض بالحجم الكامل"
          className="absolute left-3 top-3 grid h-9 w-9 place-content-center rounded-full bg-white/90 text-ink shadow-card transition hover:bg-white">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
        {many && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="السابق"
              className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-content-center rounded-full bg-white/90 text-lg text-ink shadow-card transition hover:bg-white">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="التالي"
              className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-content-center rounded-full bg-white/90 text-lg text-ink shadow-card transition hover:bg-white">›</button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {live.map((src, j) => (
                <span key={`${src}-${j}`} className={`h-1.5 rounded-full transition-all ${j === idx ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
              ))}
            </div>
          </>
        )}
      </div>
      {many && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {live.map((src, j) => (
            <button key={`${src}-${j}`} type="button" onClick={() => setI(j)} aria-label={`صورة ${j + 1}`}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-m border-2 transition ${j === idx ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full bg-tint object-cover"
                onError={() => markBroken(src)} />
            </button>
          ))}
        </div>
      )}

      {open && (
        <Lightbox
          images={live}
          index={idx}
          alt={alt}
          onIndex={setI}
          onClose={() => setOpen(false)}
          onBroken={markBroken}
        />
      )}
    </div>
  );
}

/* Elegant non-clickable fallback when a work/service has no media. */
function MediaPlaceholder() {
  return (
    <div
      aria-hidden
      className="relative grid h-[clamp(200px,30vh,340px)] w-full place-content-center overflow-hidden rounded-l border border-line bg-gradient-to-br from-tint via-white to-tint"
    >
      {/* soft decorative blobs */}
      <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <span className="pointer-events-none absolute -bottom-14 -left-10 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col items-center gap-3 text-primary/60">
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <circle cx="8.5" cy="9.5" r="1.8" />
          <path d="M21 16l-5-5-7 7" />
        </svg>
        <span className="text-sm font-medium text-sub">لا توجد صورة متاحة</span>
      </div>
    </div>
  );
}

function Lightbox({
  images, index, alt, onIndex, onClose, onBroken,
}: {
  images: string[]; index: number; alt: string;
  onIndex: (i: number) => void; onClose: () => void; onBroken: (src: string) => void;
}) {
  const [shown, setShown] = useState(false);
  const many = images.length > 1;
  const move = (d: number) => onIndex((index + d + images.length) % images.length);

  useEffect(() => {
    setShown(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndex((index + 1) % images.length);
      else if (e.key === "ArrowRight") onIndex((index - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, onClose, onIndex]);

  return (
    <div
      role="dialog" aria-modal="true" aria-label={alt}
      onClick={onClose}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-200 sm:p-8 ${shown ? "opacity-100" : "opacity-0"}`}
      style={{ background: "rgba(15,18,32,0.88)" }}
    >
      <button type="button" onClick={onClose} aria-label="إغلاق"
        className="absolute right-4 top-4 grid h-10 w-10 place-content-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20">×</button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[index]} alt={alt}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[88vh] max-w-[92vw] rounded-l object-contain shadow-2xl transition-all duration-300 ${shown ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
        onError={() => onBroken(images[index])} />

      {many && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); move(1); }} aria-label="السابق"
            className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-content-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20">‹</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); move(-1); }} aria-label="التالي"
            className="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-content-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20">›</button>
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
            {images.map((_, j) => (
              <button key={j} type="button" onClick={(e) => { e.stopPropagation(); onIndex(j); }} aria-label={`صورة ${j + 1}`}
                className={`h-2 rounded-full transition-all ${j === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

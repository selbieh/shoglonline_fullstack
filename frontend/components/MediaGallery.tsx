"use client";

import { useState } from "react";

/* Hero image + thumbnail strip with prev/next + dots (ppt slides 20/21/22 work-showcase carousel).
   RTL: the «‹» control advances toward the start. Falls back gracefully to a single image. */

export default function MediaGallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  if (!images || images.length === 0) {
    return <div className="aspect-video w-full rounded-l border border-line bg-tint" aria-hidden />;
  }
  const go = (d: number) => setI((p) => (p + d + images.length) % images.length);
  const many = images.length > 1;

  return (
    <div>
      <div className="relative overflow-hidden rounded-l border border-line bg-ink/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i]} alt={alt} className="aspect-video w-full object-cover" />
        {many && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="السابق"
              className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-content-center rounded-full bg-white/90 text-lg text-ink shadow-card transition hover:bg-white">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="التالي"
              className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-content-center rounded-full bg-white/90 text-lg text-ink shadow-card transition hover:bg-white">›</button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, j) => (
                <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
              ))}
            </div>
          </>
        )}
      </div>
      {many && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, j) => (
            <button key={j} type="button" onClick={() => setI(j)} aria-label={`صورة ${j + 1}`}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-m border-2 transition ${j === i ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

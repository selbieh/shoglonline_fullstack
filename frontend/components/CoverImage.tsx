"use client";

import { useState } from "react";

/* A decorative cover/banner image that simply removes itself when it fails to load (e.g. a dead
   legacy link that 403/404s), revealing whatever branded gradient sits beneath it — so the broken
   image glyph never shows. For server components that can't attach an onError handler directly. */
export default function CoverImage({ src, className }: { src: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={className} />
  );
}

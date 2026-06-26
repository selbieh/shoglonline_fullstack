"use client";

import { useEffect, useState } from "react";

/* Detects whether the mobile on-screen keyboard is open by watching the visual
   viewport: when the keyboard slides up the visual viewport shrinks while the
   layout viewport (window.innerHeight) stays the same. We treat a gap larger
   than ~150px as "keyboard open". Used to hide sticky bottom bars that would
   otherwise overlap the focused field on mobile. */
export function useKeyboardOpen(threshold = 150): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const update = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setOpen(gap > threshold);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [threshold]);

  return open;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/* Thin top progress bar that gives instant feedback the moment a navigation starts — even before
 * the destination's `loading.tsx` skeleton paints. Works for BOTH <Link> clicks and
 * router.push()/replace() calls, because every App Router navigation ultimately goes through
 * history.pushState/replaceState, which we patch to fire a "start". The bar completes when the
 * pathname or query actually changes. No external dependency.
 *
 * Must be rendered inside <Suspense> (it reads useSearchParams) — see app/layout.tsx. */
export default function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Patch history methods once so any navigation start is observable.
  useEffect(() => {
    const start = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(true);
      setProgress(8);
      if (trickle.current) clearInterval(trickle.current);
      // creep toward 90% so a slow server fetch still feels like progress
      trickle.current = setInterval(() => {
        setProgress((p) => (p < 90 ? p + Math.max(0.4, (90 - p) * 0.08) : p));
      }, 200);
    };

    const { pushState, replaceState } = window.history;
    window.history.pushState = function (...args) {
      start();
      return pushState.apply(this, args as Parameters<typeof pushState>);
    };
    window.history.replaceState = function (...args) {
      start();
      return replaceState.apply(this, args as Parameters<typeof replaceState>);
    };
    window.addEventListener("popstate", start);

    return () => {
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
      window.removeEventListener("popstate", start);
      if (trickle.current) clearInterval(trickle.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Route actually changed → finish: snap to 100%, then fade out and reset.
  useEffect(() => {
    if (trickle.current) clearInterval(trickle.current);
    if (!visible) return;
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full bg-cta shadow-[0_0_8px_rgba(43,80,201,0.6)]"
        style={{
          width: `${progress}%`,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}

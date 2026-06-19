"use client";

import { useState, type MouseEvent } from "react";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { HeartIcon } from "@/components/icons";

/* Heart toggle for saving any entity to favourites (ppt slide-43). Services use the dedicated
   endpoint (/me/favorites/<id>); jobs/freelancers/portfolio use the generic one
   (/me/favorites/<kind>/<id>). Optimistic; reverts on failure. Stops propagation so it can sit
   inside a clickable card/link. */
export default function FavoriteButton({
  kind, id, initial = false, className,
}: {
  kind: "service" | "job" | "freelancer" | "portfolio";
  id: number;
  initial?: boolean;
  className?: string;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!tokens.access) {
      window.location.href = signinHereHref();
      return;
    }
    const next = !on;
    setOn(next);
    setBusy(true);
    const url = kind === "service" ? `/me/favorites/${id}` : `/me/favorites/${kind}/${id}`;
    try {
      await api(url, { method: next ? "PUT" : "DELETE" });
    } catch {
      setOn(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={on ? "إزالة من المفضلة" : "حفظ في المفضلة"}
      aria-pressed={on}
      className={className ?? "grid h-9 w-9 place-content-center rounded-full bg-white/90 text-danger shadow-sm ring-1 ring-line transition hover:bg-danger-t disabled:opacity-50"}
    >
      <HeartIcon filled={on} className="text-[18px]" />
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api, tokens } from "@/lib/api";

type FavKind = "service" | "job" | "freelancer" | "portfolio";

/* Loads the signed-in user's saved-item IDs for one favourite kind so listing cards can render the
   heart pre-filled. Without it the user can't tell what they've already saved and re-favourites the
   same card repeatedly (the toggle endpoint is idempotent, so it silently no-ops). One request per
   listing page; returns an empty set for signed-out visitors. */
export function useFavoriteIds(kind: FavKind): Set<number> {
  const [ids, setIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!tokens.access) return;
    let alive = true;
    api<{ id: number }[]>(`/me/favorites?kind=${kind}`)
      .then((rows) => {
        if (alive && Array.isArray(rows)) setIds(new Set(rows.map((r) => r.id)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kind]);

  return ids;
}

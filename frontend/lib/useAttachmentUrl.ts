"use client";

import { useEffect, useState } from "react";

import { API_URL, tokens } from "./api";

/**
 * Resolve a chat attachment to a browser-usable object URL.
 *
 * The download endpoint `GET /uploads/{id}` is auth-scoped (IsAuthenticated + party-of-host), so an
 * `<img src>` / `<audio src>` can't load it directly — the browser won't attach the bearer token.
 * We fetch the bytes WITH the Authorization header, then hand back an object URL.
 *
 * NOT routed through `api()` (which forces a JSON content-type and `res.json()`). Results are cached
 * per-id for the session so a thread re-render or remount never refetches the same blob; the URLs
 * live until the page unloads (bounded by the attachments actually viewed).
 */
const cache = new Map<number, Promise<string>>();

async function fetchBlobUrl(id: number, retry = true): Promise<string> {
  const headers: Record<string, string> = {};
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  const res = await fetch(`${API_URL}/uploads/${id}`, { headers });
  if (res.status === 401 && retry) {
    cache.delete(id);
    return fetchBlobUrl(id, false);
  }
  if (!res.ok) throw new Error(`attachment ${id} failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

function load(id: number): Promise<string> {
  let p = cache.get(id);
  if (!p) {
    p = fetchBlobUrl(id).catch((e) => {
      cache.delete(id); // let a later mount retry a transient failure
      throw e;
    });
    cache.set(id, p);
  }
  return p;
}

/** `enabled=false` defers the fetch (used for click-to-load video). */
export function useAttachmentUrl(id: number, enabled = true): { url: string; loading: boolean; error: boolean } {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !id) return;
    let active = true;
    setLoading(true);
    setError(false);
    load(id)
      .then((u) => active && (setUrl(u), setLoading(false)))
      .catch(() => active && (setError(true), setLoading(false)));
    return () => {
      active = false;
    };
  }, [id, enabled]);

  return { url, loading, error };
}

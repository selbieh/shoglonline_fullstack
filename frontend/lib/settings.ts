"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Public feature flags (BR-19: UX gating only — the backend re-checks every flag server-side).
 * Fetched from GET /api/v1/settings/public, which is unauthenticated, so this works pre-login.
 */
export type PublicSettings = {
  "bids.enabled"?: boolean;
  [key: string]: unknown;
};

const TTL_MS = 60_000; // mirror the backend's 60s settings cache so a flag flip propagates
let cache: { at: number; data: PublicSettings } | null = null;
let inflight: Promise<PublicSettings> | null = null;

/**
 * Returns the public flags, cached for ~60s. Fails OPEN (returns {}) on any error so a transient
 * network blip never hides/breaks a feature — callers treat a missing flag as its default.
 */
export async function fetchPublicSettings(force = false): Promise<PublicSettings> {
  const now = Date.now();
  if (!force && cache && now - cache.at < TTL_MS) return cache.data;
  if (!force && inflight) return inflight;

  inflight = api<PublicSettings>("/settings/public")
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .catch(() => (cache?.data ?? {})) // fail open: keep last good value, else empty (= all defaults)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Clears the module cache — used by tests so each case can stub a different flag state. */
export function resetPublicSettingsCache(): void {
  cache = null;
  inflight = null;
}

/** True unless the flag is explicitly false (default-on / fail-open). */
export function bidsEnabled(settings: PublicSettings): boolean {
  return settings["bids.enabled"] !== false;
}

/** Reactive accessor for client components. */
export function usePublicSettings(): { settings: PublicSettings; loading: boolean } {
  const [settings, setSettings] = useState<PublicSettings>(cache?.data ?? {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    fetchPublicSettings().then((data) => {
      if (alive) {
        setSettings(data);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return { settings, loading };
}

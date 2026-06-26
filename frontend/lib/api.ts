/**
 * Minimal API client for the scaffold.
 *
 * NOTE (SEC-1 / SRS §16.3): tokens are kept in localStorage for the scaffold only.
 * Before production launch, move the session to HTTP-only secure cookies issued by
 * the backend (the SRS-preferred approach) — tracked as a Phase-3 hardening task.
 */
import { signinHereHref } from "./nav";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const ACCESS_KEY = "sh_access";
const REFRESH_KEY = "sh_refresh";
const PROFILE_KEY = "sh_me";

export const tokens = {
  get access() {
    return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(PROFILE_KEY);
  },
  get refresh() {
    return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
  },
};

/**
 * Lightweight cache of the signed-in user's display fields (name + avatar), kept in
 * localStorage so the header can paint the real profile on the first client frame after a
 * reload — instead of flashing the logged-out state, then a generic avatar, while /auth/me
 * is in flight. Always re-validated against /auth/me; cleared by tokens.clear() on logout.
 */
export const profileCache = {
  read<T = unknown>(): T | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  write(me: unknown) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(me));
    } catch {
      /* quota / serialization — non-fatal, cache is best-effort */
    }
  },
};

// The backend rotates refresh tokens and blacklists the old one after rotation
// (SIMPLE_JWT ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION). If several requests 401 at once
// and each refreshed independently, the first rotation would blacklist the shared refresh token and
// the rest would fail → the user gets bounced to sign-in. Coalesce concurrent refreshes into one.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccess(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refresh = tokens.refresh;
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      tokens.set(data.access, data.refresh ?? refresh);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry && (await refreshAccess())) {
    return api<T>(path, options, false);
  }
  if (res.status === 401) {
    tokens.clear();
    // bounce to sign-in, remembering the current page so login returns the user here
    if (typeof window !== "undefined") window.location.href = signinHereHref();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error("api_error"), { status: res.status, body });
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type Attachment = {
  id: number;
  original_name: string;
  content_type: string;
  size: number;
  kind: "image" | "video" | "audio" | "document" | "archive" | "other";
  url: string;
  created_at: string;
};

/**
 * Multipart upload to POST /uploads. Kept separate from `api()` because it must NOT send a
 * JSON Content-Type (the browser sets the multipart boundary). Reuses the 401→refresh→retry path.
 */
export async function uploadFile(file: File, retry = true): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  const res = await fetch(`${API_URL}/uploads`, { method: "POST", headers, body: form });
  if (res.status === 401 && retry && (await refreshAccess())) return uploadFile(file, false);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error("api_error"), { status: res.status, body });
  }
  return res.json();
}

export type Me = {
  id: number;
  email: string;
  email_verified?: boolean;
  first_name: string;
  last_name: string;
  avatar_url: string;
  phone_verified?: boolean;
  active_mode: "find_job" | "find_worker" | "";
  status: string;
};

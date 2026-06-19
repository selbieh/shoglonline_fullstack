/**
 * Sign-in redirect helpers — let a protected page or action send the user to
 * /signin and bring them back to where they were after a successful login.
 *
 * The return target is carried in a `?next=` query param. We only ever honour a
 * same-origin absolute path (guards against open-redirect via `//evil.com` or an
 * absolute URL). The landing page, the sign-in page itself, and the onboarding
 * flow are treated as "no useful return target" so the post-login default
 * (dashboard / mode selection) wins instead of bouncing back to them.
 */

export function safeNext(raw?: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw === "/" || raw.startsWith("/signin") || raw.startsWith("/onboarding")) return null;
  return raw;
}

/** Build a `/signin` link that returns to `next` after login (or the bare link). */
export function signinHref(next?: string | null): string {
  const safe = safeNext(next);
  return safe ? `/signin?next=${encodeURIComponent(safe)}` : "/signin";
}

/** The current path + query as a return target — client-only (null during SSR). */
export function here(): string | null {
  return typeof window === "undefined" ? null : window.location.pathname + window.location.search;
}

/** `/signin` link that returns to the current page after login (client-only). */
export function signinHereHref(): string {
  return signinHref(here());
}

/** Read a validated `next` target from the current URL's query string (client-only). */
export function nextFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

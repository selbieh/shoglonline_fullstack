/**
 * Lightweight i18n catalog accessor (NFR-LOC-1/2). The app is Arabic-default with `/en` reserved;
 * a single active locale needs no provider/router, so components call `getMessages()` and read typed
 * keys. When a real second locale + URL routing land, swap getMessages to resolve the request locale
 * (e.g. via next-intl) — call sites and the catalog shape stay unchanged (AC-2).
 */
import { ar, type Messages } from "@/messages/ar";
import { en } from "@/messages/en";

export type Locale = "ar" | "en";
export const DEFAULT_LOCALE: Locale = "ar";

const CATALOGS: Record<Locale, Messages> = { ar, en };

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
}

/** Flatten nested catalog keys to dotted paths — used by the key-parity test. */
export function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? flattenKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

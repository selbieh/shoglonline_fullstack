/**
 * Arabic-aware normalisation for search/filter matching.
 * So "ابداع" matches "إبداع", diacritics are ignored, alef/ya/hamza/ta-marbuta
 * variants collapse, and casing/whitespace don't matter.
 */
/**
 * Map Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII so `Number()` can parse them.
 * Users on Arabic keyboards type "١٠"; without this, numeric fields read as NaN and
 * validation wrongly rejects valid input.
 */
export function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Numeric-only input filter: normalize Arabic/Persian digits, then drop everything that isn't 0-9. */
export function digitsOnly(s: string): string {
  return toAsciiDigits(s).replace(/\D/g, "");
}

/**
 * Arabic-correct day count: "يوم" (1), "يومان" (2), "N أيام" (3–10), "N يومًا" (11+).
 * Avoids the always-plural "1 أيام" / "2 أيام" bug.
 */
export function pluralizeDays(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  const en = n.toLocaleString("en-US");
  if (n >= 3 && n <= 10) return `${en} أيام`;
  return `${en} يومًا`;
}

export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "") // tashkeel / diacritics
    .replace(/[إأآا]/g, "ا") // unify alef forms
    .replace(/[ىئ]/g, "ي") // alef-maqsura / hamza-on-ya → ya
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه") // ta-marbuta → ha
    .replace(/\s+/g, " ")
    .trim();
}

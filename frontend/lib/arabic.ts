/**
 * Arabic-aware normalisation for search/filter matching.
 * So "ابداع" matches "إبداع", diacritics are ignored, alef/ya/hamza/ta-marbuta
 * variants collapse, and casing/whitespace don't matter.
 */
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

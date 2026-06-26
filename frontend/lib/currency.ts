// Single source of truth for how money is shown across the app.
// Canonical format (chosen product-wide): "<amount> دولار أمريكي"
// e.g. 100 → "100 دولار أمريكي", a range → "500–1,500 دولار أمريكي".
// Numbers use en-US grouping (1,500) and stay LTR inside the Arabic phrase.

export const USD_LABEL = "دولار أمريكي";
/** Short hint for input fields placed near a number entry. */
export const USD_INPUT_HINT = "بالدولار الأمريكي";

type Amount = number | string | null | undefined;

function toNumber(value: Amount): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : null;
}

type FormatOpts = {
  /** Force a fixed number of decimals (e.g. 2 for wallet/invoice amounts). */
  decimals?: number;
  /** Prepend an explicit sign for positive numbers (used in ledgers). */
  signed?: boolean;
  /** What to render when the value is missing/invalid. Default "—". */
  fallback?: string;
};

/** Format just the number part (grouping + optional fixed decimals), no currency word. */
export function formatAmount(value: Amount, opts: FormatOpts = {}): string {
  const n = toNumber(value);
  if (n === null) return opts.fallback ?? "—";
  const numberOpts: Intl.NumberFormatOptions =
    opts.decimals != null
      ? { minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals }
      : {};
  const body = Math.abs(n).toLocaleString("en-US", numberOpts);
  const sign = n < 0 ? "−" : opts.signed ? "+" : "";
  return `${sign}${body}`;
}

/** Format a single price as "<amount> دولار أمريكي". */
export function formatUSD(value: Amount, opts: FormatOpts = {}): string {
  const n = toNumber(value);
  if (n === null) return opts.fallback ?? "—";
  return `${formatAmount(n, opts)} ${USD_LABEL}`;
}

/** Format a min–max range as "<min>–<max> دولار أمريكي" (single label). */
export function formatUSDRange(min: Amount, max: Amount, opts: FormatOpts = {}): string {
  const lo = toNumber(min);
  const hi = toNumber(max);
  if (lo === null && hi === null) return opts.fallback ?? "—";
  if (lo !== null && hi !== null) {
    return `${formatAmount(lo, opts)}–${formatAmount(hi, opts)} ${USD_LABEL}`;
  }
  return formatUSD(lo ?? hi, opts);
}

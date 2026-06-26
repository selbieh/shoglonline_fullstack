// Shared display formatters (Arabic-first). Keep UI-agnostic — pure functions only.

// ar-u-nu-latn: Arabic wording ("منذ … دقائق") with Western/English digits.
const rtf = new Intl.RelativeTimeFormat("ar-u-nu-latn", { numeric: "auto" });

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/**
 * Arabic relative time, e.g. "منذ ١٠ دقائق". Returns "" for falsy/invalid input
 * so callers can `{when && <Badge/>}` without guarding the date themselves.
 */
export function timeAgo(date: string | number | Date | null | undefined): string {
  if (!date) return "";
  const ts = new Date(date).getTime();
  if (Number.isNaN(ts)) return "";
  let duration = (ts - Date.now()) / 1000; // seconds; negative for the past
  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit);
    duration /= amount;
  }
  return "";
}

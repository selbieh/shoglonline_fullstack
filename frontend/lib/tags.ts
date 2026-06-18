// Soft multi-colour tones for skill / category pills. Deterministic per label so a
// given skill keeps the same colour across every card it appears on.
// NOTE: keep these as complete class strings — Tailwind scans this file (lib/**) and
// only generates classes it can see literally.
const TAG_TONES = [
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

/** Pick a stable soft tone (bg + text classes) for a label via a small string hash. */
export function tagTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TAG_TONES[h % TAG_TONES.length];
}

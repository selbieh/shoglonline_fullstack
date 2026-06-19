// Calm, on-brand pill tones for skill / category labels — periwinkle / lavender /
// light-blue family only (matches Sho8l PDF), NOT a rainbow. Deterministic per label so a
// given skill keeps the same tone across every card it appears on.
// NOTE: keep these as complete class strings — Tailwind scans this file (lib/**) and only
// generates classes it can see literally (tokens: tint / accent-sky / primary).
const BRAND_TONES = [
  "bg-tint text-primary-dark",
  "bg-accent-sky text-primary-deep",
  "bg-primary/10 text-primary-dark",
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Pick a stable on-brand tone (bg + text classes) for a label via a small string hash. */
export function tagTone(seed: string): string {
  return BRAND_TONES[hashSeed(seed) % BRAND_TONES.length];
}

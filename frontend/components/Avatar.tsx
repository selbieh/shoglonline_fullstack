"use client";

import { useState } from "react";

/**
 * Resilient avatar: renders the uploaded photo when it loads, otherwise a clean initials tile on a
 * deterministic brand-tinted gradient (so the same person always gets the same colour). Handles BOTH
 * a missing `src` AND a broken/blocked `src` (e.g. a Google avatar URL that fails) — the broken-image
 * glyph never shows. Drop-in for the freelancer cards, the profile hero, etc.
 */
// On-brand periwinkle-family gradients (matches the theme) — deterministic per name.
const GRADIENTS = [
  "from-primary to-primary-deep",
  "from-[#9197d6] to-primary-dark",
  "from-primary-dark to-primary-deep",
  "from-[#B0B5E0] to-primary",
  "from-primary to-primary-dark",
  "from-[#8086cf] to-[#424783]",
];

function pickGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] || "") + (parts[1][0] || "");
}

export default function Avatar({
  name,
  src,
  className = "h-16 w-16",
  textClassName = "text-2xl",
}: {
  name: string;
  src?: string | null;
  /** size + shape utilities (must include rounding, e.g. "h-20 w-20"); rounded-full is applied) */
  className?: string;
  textClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImg = !!src && !broken;

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src!}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={`${className} rounded-full bg-tint object-cover`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      aria-label={name}
      role="img"
      className={`${className} ${textClassName} grid select-none place-content-center rounded-full bg-gradient-to-br ${pickGradient(
        name || "?",
      )} font-extrabold uppercase text-white`}
    >
      {initialsOf(name)}
    </span>
  );
}

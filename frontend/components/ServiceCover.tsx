"use client";

import { useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";

/* Branded default cover for a service with no uploaded image. A premium, layered composition —
   a per-category *mesh* gradient (several blended colour blobs), a giant ghosted category glyph
   as an editorial watermark, soft floating orbs and thin rings, a faint dotted texture, a slow
   diagonal light sweep, and a gradient-ringed glass emblem whose halo gently breathes behind the
   *category's own glyph*. Every service type gets an impressive, recognisable cover instead of a
   flat fill; per-category tones give the grid variety while staying in the brand periwinkle/indigo
   palette. */

// Keyed by the stable top-level slug (child slugs start with the parent slug, so a
// `startsWith` match covers subcategories too). Four stops drive the mesh blend below.
const TONES: Record<string, [string, string, string, string]> = {
  "programming-tech": ["#8a90e6", "#5a60bd", "#3a3f8f", "#23264f"],
  "design-creative": ["#b09cf0", "#7d6fd0", "#4f478f", "#2e2a5c"],
  "writing-translation": ["#8fa6ee", "#5c6fc8", "#3a4593", "#242a57"],
  "digital-marketing": ["#9aa0f0", "#646bcf", "#3e4396", "#262a5c"],
  "sales-support": ["#79b0e6", "#4d7ec8", "#33509a", "#203058"],
  "business-finance": ["#8e97ea", "#5b64c2", "#383f86", "#23264f"],
  "audio-voice": ["#b29cee", "#7c6acb", "#4a3f93", "#2b2660"],
  consulting: ["#8a96e2", "#5763bc", "#353c84", "#222652"],
};

const toneFor = (slug?: string | null): [string, string, string, string] => {
  const key = slug ? Object.keys(TONES).find((k) => slug.startsWith(k)) : undefined;
  return key ? TONES[key] : ["#9098e0", "#5a60bd", "#3a3f8f", "#23264f"];
};

export default function ServiceCover({
  slug,
  className = "",
}: {
  slug?: string | null;
  className?: string;
}) {
  const [a, b, c, d] = toneFor(slug);
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        backgroundColor: d,
        backgroundImage: [
          // mesh: bright accent top-end, a mid bloom, a deep pool bottom-start + a white spotlight
          `radial-gradient(60% 70% at 88% 6%, ${a}, transparent 62%)`,
          `radial-gradient(70% 80% at 18% 96%, ${c}, transparent 60%)`,
          `radial-gradient(55% 60% at 35% 30%, ${b}, transparent 65%)`,
          "radial-gradient(60% 50% at 80% 12%, rgba(255,255,255,0.28), transparent 60%)",
          `linear-gradient(135deg, ${b} 0%, ${c} 55%, ${d} 100%)`,
        ].join(", "),
      }}
      aria-hidden
    >
      {/* giant ghosted category glyph — editorial watermark */}
      <div className="pointer-events-none absolute -bottom-8 -end-6 rotate-[-10deg] text-white/[0.08]">
        <CategoryIcon slug={slug} className="text-[185px]" />
      </div>
      {/* faint dotted texture */}
      <div className="dots pointer-events-none absolute inset-0 opacity-30" />
      {/* soft floating orbs for depth */}
      <div className="pointer-events-none absolute -end-10 -top-12 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -start-12 h-52 w-52 rounded-full bg-[#13153f]/45 blur-3xl" />
      {/* thin decorative rings */}
      <div className="pointer-events-none absolute bottom-3 end-7 h-16 w-16 rounded-full border border-white/15" />
      <div className="pointer-events-none absolute start-7 top-5 h-8 w-8 rounded-full border border-white/20" />
      {/* slow diagonal light sweep */}
      <div className="animate-shimmer pointer-events-none absolute inset-y-0 -inset-x-1/3 bg-gradient-to-r from-transparent via-white/22 to-transparent" />

      {/* center emblem: breathing halo + gradient-ringed glass tile + the category glyph */}
      <div className="absolute inset-0 grid place-content-center">
        <div className="animate-float-slow relative grid place-content-center">
          <div className="animate-glow absolute inset-0 -z-10 m-auto h-28 w-28 rounded-full bg-white/30 blur-2xl" />
          {/* gradient ring (padding trick) wrapping the frosted tile */}
          <div className="rounded-[28px] bg-gradient-to-br from-white/80 via-white/25 to-white/5 p-[1.5px] shadow-[0_16px_40px_-12px_rgba(13,15,45,0.65)]">
            <div className="relative grid h-[92px] w-[92px] place-content-center overflow-hidden rounded-[26px] bg-white/15 text-white backdrop-blur-md">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
              <CategoryIcon slug={slug} className="relative text-[42px] drop-shadow-[0_2px_8px_rgba(13,15,45,0.4)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Service thumbnail: the uploaded cover fills the fixed 16:9 frame via object-cover (it can
    never stretch or overflow), and a missing OR broken image degrades to the branded
    per-category {@link ServiceCover} instead of the browser's broken-image glyph. */
export function ServiceThumb({
  cover,
  slug,
  alt,
}: {
  cover?: string | null;
  slug?: string | null;
  alt: string;
}) {
  const [broken, setBroken] = useState(false);
  const useCover = !!cover && !broken;
  if (!useCover) return <ServiceCover slug={slug} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cover!}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
    />
  );
}

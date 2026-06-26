import type { ReactNode } from "react";

/* Shared "profile-style" listing primitives — mirror the freelancer profile hero
   (frontend/app/freelancers/[id]/page.tsx): a clean white card with a horizontal
   labeled-stats strip and an emphasized price line above a single action button.
   Used by the freelancers / jobs / services listings so all three read the same.
   Each listing keeps its own media, badges, and existing CTA. */

/** One stat in the strip: a small icon + label on top, a bold value below (matches HeroStat). */
export function ListingStat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-sub">
        <span className="shrink-0 text-[14px] text-primary">{icon}</span>
        <span className="truncate text-xs">{label}</span>
      </div>
      <div className="mt-1 truncate text-sm font-extrabold text-ink sm:text-[15px]" dir="auto">{value}</div>
    </div>
  );
}

/** The horizontal stats strip — a soft inset panel so it reads as one block on the card.
    `cols` matches the number of stats passed (3 by default; 4 wraps to 2×2 on mobile). */
export function ListingStats({ children, cols = 3 }: { children: ReactNode; cols?: 3 | 4 }) {
  const grid = cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3";
  return (
    <div className={`mt-3 grid ${grid} gap-x-4 gap-y-3 rounded-m bg-bg px-4 py-3`}>
      {children}
    </div>
  );
}

/** Footer: emphasized price/value on the start side, the listing's existing CTA on the end. */
export function ListingFooter({
  priceLabel,
  priceValue,
  priceSuffix,
  children,
}: {
  priceLabel: string;
  priceValue: ReactNode;
  priceSuffix?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-[11px] text-sub">{priceLabel}</span>
        <span className="text-xl font-extrabold text-primary" dir="auto">{priceValue}</span>
        {priceSuffix && <span className="text-xs font-medium text-sub">{priceSuffix}</span>}
      </span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

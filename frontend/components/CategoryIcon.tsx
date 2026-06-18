/* Resolve a catalog category to a modern line-icon by its top-level slug, replacing
   the legacy emoji icons. Falls back to a neutral grid icon for unknown slugs. */
import type { SVGProps } from "react";
import {
  BarChartIcon, CodeIcon, CompassIcon, GridIcon, HeadsetIcon, MegaphoneIcon, MicIcon,
  PaletteIcon, PenIcon,
} from "./icons";

type IconFn = (p: SVGProps<SVGSVGElement>) => JSX.Element;

// Keyed by the stable top-level slug; child slugs start with the parent slug so a
// `startsWith` match covers subcategories too.
const BY_SLUG: Record<string, IconFn> = {
  "programming-tech": CodeIcon,
  "design-creative": PaletteIcon,
  "writing-translation": PenIcon,
  "digital-marketing": MegaphoneIcon,
  "sales-support": HeadsetIcon,
  "business-finance": BarChartIcon,
  "audio-voice": MicIcon,
  consulting: CompassIcon,
};

export function CategoryIcon({
  slug,
  ...props
}: { slug?: string | null } & SVGProps<SVGSVGElement>) {
  const key = slug ? Object.keys(BY_SLUG).find((k) => slug.startsWith(k)) : undefined;
  const Icon = key ? BY_SLUG[key] : GridIcon;
  return <Icon {...props} />;
}

// Curated soft tone (bg + icon colour) per top-level category — calm, not rainbow.
const TONE_BY_SLUG: Record<string, string> = {
  "programming-tech": "bg-sky-100 text-sky-700",
  "design-creative": "bg-violet-100 text-violet-700",
  "writing-translation": "bg-amber-100 text-amber-700",
  "digital-marketing": "bg-rose-100 text-rose-700",
  "sales-support": "bg-teal-100 text-teal-700",
  "business-finance": "bg-emerald-100 text-emerald-700",
  "audio-voice": "bg-fuchsia-100 text-fuchsia-700",
  consulting: "bg-indigo-100 text-indigo-700",
};

/** Soft icon-tile colour classes for a category; falls back to the brand tint. */
export function categoryTone(slug?: string | null): string {
  const key = slug ? Object.keys(TONE_BY_SLUG).find((k) => slug.startsWith(k)) : undefined;
  return key ? TONE_BY_SLUG[key] : "bg-tint text-primary-dark";
}

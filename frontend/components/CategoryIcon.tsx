/* Resolve a catalog category to a modern line-icon by its top-level slug, replacing
   the legacy emoji icons. Falls back to a neutral grid icon for unknown slugs. */
import type { SVGProps } from "react";
import { tagTone } from "@/lib/tags";
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

/** On-brand icon-tile colour classes for a category. Calm periwinkle/lavender/light-blue
    family (via the shared `tagTone` set) — stable per slug; falls back to the brand tint. */
export function categoryTone(slug?: string | null): string {
  // Match by top-level slug so subcategories share their parent's tone.
  const key = slug ? Object.keys(BY_SLUG).find((k) => slug.startsWith(k)) : undefined;
  return key ? tagTone(key) : "bg-tint text-primary-dark";
}

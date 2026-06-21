/* Resolve a catalog category to a modern line-icon. The backend now returns an
   `icon` key (admin-selectable from a dropdown) which drives the rendering; the
   top-level slug is kept as a fallback for callers that don't pass an icon.
   Falls back to a neutral grid icon when neither resolves. */
import type { SVGProps } from "react";
import { tagTone } from "@/lib/tags";
import {
  BarChartIcon, CodeIcon, CompassIcon, GridIcon, HeadsetIcon, MegaphoneIcon, MicIcon,
  PaletteIcon, PenIcon,
} from "./icons";

type IconFn = (p: SVGProps<SVGSVGElement>) => JSX.Element;

// Keyed by the backend icon key (Category.ICON_CHOICES). Keep these keys in sync
// with the backend model so an admin's dropdown choice always has an icon here.
const BY_ICON: Record<string, IconFn> = {
  code: CodeIcon,
  palette: PaletteIcon,
  pen: PenIcon,
  megaphone: MegaphoneIcon,
  headset: HeadsetIcon,
  "bar-chart": BarChartIcon,
  mic: MicIcon,
  compass: CompassIcon,
  grid: GridIcon,
};

// Fallback keyed by the stable top-level slug; child slugs start with the parent
// slug so a `startsWith` match covers subcategories too.
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

const iconBySlug = (slug?: string | null): IconFn | undefined => {
  const key = slug ? Object.keys(BY_SLUG).find((k) => slug.startsWith(k)) : undefined;
  return key ? BY_SLUG[key] : undefined;
};

export function CategoryIcon({
  icon,
  slug,
  ...props
}: { icon?: string | null; slug?: string | null } & SVGProps<SVGSVGElement>) {
  const Icon = (icon ? BY_ICON[icon] : undefined) ?? iconBySlug(slug) ?? GridIcon;
  return <Icon {...props} />;
}

/** On-brand icon-tile colour classes for a category. Calm periwinkle/lavender/light-blue
    family (via the shared `tagTone` set) — stable per slug; falls back to the brand tint. */
export function categoryTone(slug?: string | null): string {
  // Match by top-level slug so subcategories share their parent's tone.
  const key = slug ? Object.keys(BY_SLUG).find((k) => slug.startsWith(k)) : undefined;
  return key ? tagTone(key) : "bg-tint text-primary-dark";
}

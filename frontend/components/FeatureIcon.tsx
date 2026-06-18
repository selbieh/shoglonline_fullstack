/* Map a CMS/legacy emoji (feature & stat tiles) to a modern line-icon. Falls back
   to the original glyph for any unmapped emoji so nothing ever disappears. */
import type { SVGProps } from "react";
import {
  BoltIcon, ChatIcon, CheckIcon, KeyIcon, LockIcon, RepeatIcon, ShieldIcon,
} from "./icons";

type IconFn = (p: SVGProps<SVGSVGElement>) => JSX.Element;

const BY_EMOJI: Record<string, IconFn> = {
  "🛡": ShieldIcon,
  "🛡️": ShieldIcon,
  "🔁": RepeatIcon,
  "🔄": RepeatIcon,
  "🔒": LockIcon,
  "🔐": LockIcon,
  "⚡": BoltIcon,
  "🔑": KeyIcon,
  "💬": ChatIcon,
  "✅": CheckIcon,
};

export function FeatureIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = BY_EMOJI[icon?.trim()];
  if (Icon) return <Icon className={className} />;
  // unmapped → keep the original glyph at the same sizing
  return <span className={className}>{icon}</span>;
}

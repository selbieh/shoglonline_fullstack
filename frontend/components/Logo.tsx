import Image from "next/image";
import Link from "next/link";
import { getMessages } from "@/lib/i18n";

type LogoProps = {
  /** Height/width utilities. Default keeps the header lockup ~36px tall. */
  className?: string;
  /** "light" flips the blue logo to white for periwinkle / transparent-hero surfaces. */
  tone?: "brand" | "light";
  /** When set, wraps the logo in a Link to this href (e.g. "/" to return home). */
  href?: string;
  priority?: boolean;
};

/**
 * Single source of truth for the brand logo. Renders the official wordmark from
 * `public/brand/logo.svg` (the `export/` master — blue wordmark "شغل أون لاين" + 3-people
 * mark + ™). `tone="light"` flips the art to a white silhouette so the same asset works on
 * the white header and the periwinkle footer/hero.
 */
export default function Logo({ className = "h-9 w-auto", tone = "brand", href, priority }: LogoProps) {
  const t = getMessages();
  const img = (
    <Image
      src="/brand/logo.svg"
      alt={t.brand}
      width={293}
      height={99}
      priority={priority}
      unoptimized
      className={`${className} ${tone === "light" ? "brightness-0 invert" : ""}`}
    />
  );
  return href ? (
    <Link href={href} aria-label={t.nav.home} className="inline-flex shrink-0 items-center">
      {img}
    </Link>
  ) : (
    img
  );
}

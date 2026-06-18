"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { tokens } from "@/lib/api";
import { getMessages } from "@/lib/i18n";

/**
 * Global site header — present on every page so the logo always returns home.
 * - On the landing page it floats transparently over the hero, then solidifies on scroll.
 * - Everywhere else it is a solid sticky bar that occupies layout space.
 * - Skipped on routes that already render their own app header (e.g. /dashboard);
 *   those make their own brand clickable instead.
 */
export default function SiteHeader() {
  const pathname = usePathname() || "/";
  const isLanding = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!tokens.access);
  }, [pathname]);

  useEffect(() => {
    if (!isLanding) return;
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isLanding]);

  // Pages that ship their own header chrome — avoid stacking two bars.
  if (pathname.startsWith("/dashboard")) return null;

  const t = getMessages();
  const transparent = isLanding && !scrolled;
  const links = [
    { label: t.nav.jobs, href: "/jobs" },
    { label: t.nav.services, href: "/services" },
    { label: t.nav.freelancers, href: "/freelancers" },
  ];

  return (
    <header
      className={`${isLanding ? "fixed" : "sticky"} inset-x-0 top-0 z-50 transition-all duration-300 ${
        transparent ? "bg-transparent" : "border-b border-line/70 bg-white/90 shadow-card backdrop-blur"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" aria-label={t.nav.home} className="group flex items-center gap-2">
          <span className="bg-hero grid h-9 w-9 place-content-center rounded-m font-extrabold text-white shadow-glow transition group-hover:scale-105">
            ش
          </span>
          <span className={`text-lg font-extrabold transition-colors ${transparent ? "text-white" : "text-ink"}`}>
            {t.brand}
          </span>
        </Link>

        <div className={`hidden items-center gap-6 text-sm font-medium transition-colors md:flex ${transparent ? "text-white/90" : "text-sub"}`}>
          {links.map((l) =>
            l.href.startsWith("#") ? (
              <a key={l.label} href={l.href} className="transition hover:opacity-70">
                {l.label}
              </a>
            ) : (
              <Link key={l.label} href={l.href} className="transition hover:opacity-70">
                {l.label}
              </Link>
            )
          )}
        </div>

        <Link
          href={authed ? "/dashboard" : "/signin"}
          className={
            transparent
              ? "btn bg-white px-4 py-2 text-sm text-primary-dark shadow-glow hover:bg-tint"
              : "btn-primary px-4 py-2 text-sm"
          }
        >
          {authed ? t.nav.dashboard : t.nav.signin}
        </Link>
      </nav>
    </header>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api, tokens } from "@/lib/api";
import { signinHref } from "@/lib/nav";
import { getMessages } from "@/lib/i18n";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import { BellIcon, EnvelopeIcon, GearIcon, UserIcon, WalletIcon } from "@/components/icons";

type Me = { first_name: string; last_name: string; avatar_url: string };

/**
 * Global site header — present on every page so the logo always returns home.
 * Authenticated users get the full PDF chrome: messages, notifications, and an
 * account menu (الملف الشخصي / المحفظة / الإعدادات / تسجيل الخروج).
 */
export default function SiteHeader() {
  const pathname = usePathname() || "/";
  const isLanding = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ok = !!tokens.access;
    setAuthed(ok);
    if (ok) api<Me>("/auth/me").then(setMe).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (!isLanding) return;
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isLanding]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Pages that ship their own header chrome — avoid stacking two bars.
  // (dashboard-area routes render the DashboardShell with its own sidebar + top bar)
  if (pathname.startsWith("/dashboard")) return null;
  if (pathname.startsWith("/contracts")) return null;
  if (pathname.startsWith("/me/proposals")) return null;
  if (pathname.startsWith("/me/services")) return null;
  if (pathname.startsWith("/signin")) return null;

  const t = getMessages();
  const transparent = isLanding && !scrolled;
  const links = [
    { label: t.nav.jobs, href: "/jobs" },
    { label: t.nav.services, href: "/services" },
    { label: t.nav.freelancers, href: "/freelancers" },
    { label: t.nav.gallery, href: "/gallery" },
  ];

  function logout() {
    api("/auth/logout", { method: "POST", body: JSON.stringify({ refresh: tokens.refresh }) }).catch(() => {});
    tokens.clear();
    window.location.href = "/";
  }

  const name = me ? `${me.first_name} ${me.last_name}`.trim() || "حسابي" : "حسابي";
  const iconBtn = transparent
    ? "text-white/90 hover:bg-white/15"
    : "text-sub hover:bg-tint hover:text-primary-dark";

  return (
    <header
      className={`${isLanding ? "fixed" : "sticky"} inset-x-0 top-0 z-50 transition-all duration-300 ${
        transparent ? "bg-transparent" : "border-b border-line/70 bg-white/90 shadow-card backdrop-blur"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" aria-label={t.nav.home} className="group flex items-center">
          <Logo priority tone={transparent ? "light" : "brand"} className="h-9 w-auto transition group-hover:scale-105" />
        </Link>

        <div className={`hidden items-center gap-7 text-sm font-medium md:flex ${transparent ? "text-white/90" : "text-sub"}`}>
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            const activeText = transparent ? "text-white" : "text-primary-dark";
            const activeBar = transparent ? "after:bg-white" : "after:bg-primary";
            return (
              <Link
                key={l.label}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-1 transition after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-center after:rounded-full after:transition-transform ${
                  active
                    ? `font-semibold ${activeText} after:scale-x-100 ${activeBar}`
                    : "after:scale-x-0 after:bg-current hover:opacity-70 hover:after:scale-x-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {authed ? (
          <div className="flex items-center gap-1.5">
            <Link href="/messages" aria-label="الرسائل" className={`grid h-9 w-9 place-content-center rounded-full text-[19px] transition ${iconBtn}`}>
              <EnvelopeIcon />
            </Link>
            <Link href="/notifications" aria-label="الإشعارات" className={`grid h-9 w-9 place-content-center rounded-full text-[19px] transition ${iconBtn}`}>
              <BellIcon />
            </Link>
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="حسابي" aria-expanded={menuOpen}
                className="flex items-center rounded-full ring-2 ring-white/70 transition hover:ring-primary">
                <Avatar name={name} src={me?.avatar_url} className="h-9 w-9" textClassName="text-sm" />
              </button>
              {menuOpen && (
                <div className="absolute end-0 mt-2 w-56 overflow-hidden rounded-l border border-line bg-white py-1.5 text-right shadow-soft-lg" dir="rtl">
                  <div className="border-b border-line px-4 py-2.5">
                    <p className="truncate text-sm font-bold text-ink">{name}</p>
                    <p className="text-xs text-sub">عرض / تعديل ملفي</p>
                  </div>
                  <MenuLink href="/me/profile" icon={<UserIcon />} label="الملف الشخصي" />
                  <MenuLink href="/dashboard" icon={<GearIcon />} label="لوحة التحكم" />
                  <MenuLink href="/wallet" icon={<WalletIcon />} label="المحفظة" />
                  <MenuLink href="/settings" icon={<GearIcon />} label="الإعدادات" />
                  <button type="button" onClick={logout}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger transition hover:bg-danger-t">
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <Link
            href={signinHref(pathname)}
            className={transparent ? "btn bg-white px-4 py-2 text-sm text-primary-dark shadow-glow hover:bg-tint" : "btn-primary px-4 py-2 text-sm"}
          >
            {t.nav.signin}
          </Link>
        )}
      </nav>
    </header>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition hover:bg-tint">
      <span className="text-[17px] text-sub">{icon}</span>
      {label}
    </Link>
  );
}

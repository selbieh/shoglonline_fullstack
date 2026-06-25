"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api, tokens } from "@/lib/api";
import { signinHref } from "@/lib/nav";
import { getMessages } from "@/lib/i18n";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import { BellIcon, CloseIcon, EnvelopeIcon, GearIcon, MenuIcon, UserIcon, WalletIcon } from "@/components/icons";

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
  const [navOpen, setNavOpen] = useState(false);
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

  // Mobile drawer: close on navigation, and while open lock body scroll + close on Escape.
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  // Pages that ship their own header chrome — avoid stacking two bars.
  // (dashboard-area routes render the DashboardShell with its own sidebar + top bar)
  if (pathname.startsWith("/dashboard")) return null;
  if (pathname.startsWith("/contracts")) return null;
  if (pathname.startsWith("/me/proposals")) return null;
  if (pathname.startsWith("/me/services")) return null;
  if (pathname.startsWith("/me/activity")) return null;
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
    <>
    <header
      className={`${isLanding ? "fixed" : "sticky"} inset-x-0 top-0 z-50 transition-all duration-300 ${
        transparent ? "bg-transparent" : "border-b border-line/70 bg-white/90 shadow-card backdrop-blur"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="القائمة"
            aria-expanded={navOpen}
            className={`grid h-10 w-10 place-content-center rounded-full text-[22px] transition md:hidden ${iconBtn}`}
          >
            <MenuIcon />
          </button>
          <Link href="/" aria-label={t.nav.home} className="group flex items-center">
            <Logo priority tone={transparent ? "light" : "brand"} className="h-9 w-auto transition group-hover:scale-105" />
          </Link>
        </div>

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
            <Link href="/messages" aria-label="الرسائل" className={`grid h-10 w-10 place-content-center rounded-full text-[19px] transition ${iconBtn}`}>
              <EnvelopeIcon />
            </Link>
            <Link href="/notifications" aria-label="الإشعارات" className={`grid h-10 w-10 place-content-center rounded-full text-[19px] transition ${iconBtn}`}>
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

      {/* mobile nav drawer — rendered OUTSIDE <header> on purpose: the header uses
          backdrop-blur (a backdrop-filter), which makes it a containing block for
          position:fixed descendants and would clip this overlay to the header's height. */}
      {navOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
          <div className="animate-fade-in absolute inset-0 bg-ink/45 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <div className="animate-drawer-in absolute inset-y-0 start-0 flex w-72 max-w-[82vw] flex-col bg-white shadow-soft-lg">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Logo tone="brand" className="h-8 w-auto" />
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                aria-label="إغلاق القائمة"
                className="grid h-10 w-10 place-content-center rounded-full text-[20px] text-sub transition hover:bg-tint hover:text-primary-dark"
              >
                <CloseIcon />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              {links.map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-m px-4 py-3 text-[15px] font-medium transition ${
                      active ? "bg-tint font-semibold text-primary-dark" : "text-ink hover:bg-bg"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}

              <div className="my-2 border-t border-line" />

              {authed ? (
                <>
                  <DrawerLink href="/me/profile" icon={<UserIcon />} label="الملف الشخصي" />
                  <DrawerLink href="/dashboard" icon={<GearIcon />} label="لوحة التحكم" />
                  <DrawerLink href="/messages" icon={<EnvelopeIcon />} label="الرسائل" />
                  <DrawerLink href="/notifications" icon={<BellIcon />} label="الإشعارات" />
                  <DrawerLink href="/wallet" icon={<WalletIcon />} label="المحفظة" />
                  <DrawerLink href="/settings" icon={<GearIcon />} label="الإعدادات" />
                  <button
                    type="button"
                    onClick={logout}
                    className="mt-1 flex w-full items-center gap-2.5 rounded-m px-4 py-3 text-[15px] font-medium text-danger transition hover:bg-danger-t"
                  >
                    تسجيل الخروج
                  </button>
                </>
              ) : (
                <Link href={signinHref(pathname)} className="btn-primary mt-1 w-full justify-center py-3 text-sm">
                  {t.nav.signin}
                </Link>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function DrawerLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-m px-4 py-3 text-[15px] text-ink transition hover:bg-bg">
      <span className="text-[18px] text-sub">{icon}</span>
      {label}
    </Link>
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

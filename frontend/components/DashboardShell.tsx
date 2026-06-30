"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { api, tokens, profileCache } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import CountBadge from "@/components/CountBadge";
import { useUnreadCounts } from "@/lib/useUnreadCounts";
import {
  BarChartIcon, BellIcon, BriefcaseIcon, ClipboardIcon, CloseIcon, CompassIcon, EnvelopeIcon, GearIcon,
  GridIcon, HeadsetIcon, MenuIcon, SendIcon, ShieldIcon, SparklesIcon, StarIcon, UserIcon, WalletIcon,
} from "@/components/icons";

type IconCmp = (props: { className?: string }) => JSX.Element;
type Me = { first_name: string; last_name: string; avatar_url: string };

/* Dashboard app shell — the PPT freelancer console (slides 13-17): a right-hand sidebar of
   sections + a top bar (home / notifications / messages / account menu). Wrap any dashboard-area
   page: <DashboardShell active="tasks" title="مهامي" subtitle="…">…</DashboardShell>. */

const NAV: { key: string; label: string; href: string; Icon: IconCmp }[] = [
  { key: "home", label: "لوحة التحكم", href: "/dashboard", Icon: BarChartIcon },
  { key: "profile", label: "الملف الشخصي", href: "/me/profile", Icon: UserIcon },
  { key: "browse", label: "تصفح المشاريع", href: "/jobs", Icon: CompassIcon },
  { key: "proposals", label: "عروضي", href: "/me/proposals", Icon: ClipboardIcon },
  { key: "activity", label: "طلباتي ونشاطي", href: "/me/activity", Icon: SendIcon },
  { key: "tasks", label: "مهامي", href: "/contracts", Icon: BriefcaseIcon },
  { key: "services", label: "خدماتي المصغرة", href: "/me/services", Icon: SparklesIcon },
  { key: "portfolio", label: "معرض أعمالي", href: "/me/profile#portfolio", Icon: GridIcon },
  { key: "messages", label: "الرسائل", href: "/messages", Icon: EnvelopeIcon },
  { key: "wallet", label: "المحفظة", href: "/wallet", Icon: WalletIcon },
  { key: "charge", label: "شحن المحفظة", href: "/wallet/charge?return=/wallet", Icon: WalletIcon },
  { key: "ratings", label: "التقييمات", href: "/me/profile", Icon: StarIcon },
  { key: "notifications", label: "الإشعارات", href: "/notifications", Icon: BellIcon },
  { key: "settings", label: "الإعدادات", href: "/settings", Icon: GearIcon },
  { key: "verify", label: "التحقق", href: "/settings", Icon: ShieldIcon },
];

export default function DashboardShell({
  active, title, subtitle, headerActions, children,
}: {
  active: string;
  title?: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() || "";
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const unread = useUnreadCounts();

  // Optimistic profile: paint the cached avatar/name immediately on reload, then re-validate
  // against /auth/me (see profileCache in lib/api). Avoids the empty-then-filled flash.
  useEffect(() => {
    if (!tokens.access) return;
    setMe((prev) => prev ?? profileCache.read<Me>());
    api<Me>("/auth/me")
      .then((fresh) => {
        setMe(fresh);
        profileCache.write(fresh);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Mobile sidebar drawer: close on navigation, lock body scroll + Escape while open.
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

  function logout() {
    api("/auth/logout", { method: "POST", body: JSON.stringify({ refresh: tokens.refresh }) }).catch(() => {});
    tokens.clear();
    window.location.href = "/";
  }

  const name = me ? `${me.first_name} ${me.last_name}`.trim() || "حسابي" : "حسابي";

  return (
    <div dir="rtl" className="flex min-h-screen bg-bg">
      {/* ── sidebar (right in RTL) — auto-collapses to an icon rail when the
           pointer leaves it, expanding back to full width with labels on hover ── */}
      <aside className="group sticky top-0 hidden h-screen w-20 shrink-0 flex-col overflow-hidden border-l border-line bg-white transition-[width] duration-300 ease-out hover:w-64 lg:flex">
        {/* collapsed → compact 3-people mark; expanded (hover) → full wordmark lockup */}
        <Link href="/" aria-label="الرئيسية" className="flex items-center justify-center overflow-hidden border-b border-line px-3 py-4 group-hover:justify-start group-hover:px-6">
          <Image src="/logo-mark.png" alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 object-contain group-hover:hidden" />
          <Logo tone="brand" className="hidden h-8 w-auto max-w-none group-hover:block" />
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {NAV.map((n) => {
            const on = active === n.key;
            const badge = n.key === "messages" ? unread.messages : n.key === "notifications" ? unread.notifications : 0;
            return (
              <Link key={n.key} href={n.href} title={n.label}
                className={`flex items-center justify-center gap-0 rounded-m px-3 py-2.5 text-sm font-medium transition group-hover:justify-start group-hover:gap-3 ${
                  on ? "bg-tint text-primary-dark" : "text-sub hover:bg-bg hover:text-ink"
                }`}>
                <span className="relative shrink-0">
                  <n.Icon className={`text-[18px] ${on ? "text-primary" : "text-sub"}`} />
                  <CountBadge count={badge} />
                </span>
                <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[160px] group-hover:opacity-100">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/support" title="تواصل مع الدعم" className="m-3 flex items-center justify-center gap-0 rounded-m bg-tint px-3 py-3 text-sm text-primary-dark group-hover:justify-start group-hover:gap-2">
          <HeadsetIcon className="shrink-0 text-[18px]" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[160px] group-hover:opacity-100">تحتاج مساعدة؟<br /><span className="font-bold">تواصل مع الدعم</span></span>
        </Link>
      </aside>

      {/* ── mobile sidebar drawer (the desktop aside is lg-only) ── */}
      {navOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="قائمة لوحة التحكم">
          <div className="animate-fade-in absolute inset-0 bg-ink/45 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <div className="animate-drawer-in absolute inset-y-0 start-0 flex w-64 max-w-[82vw] flex-col bg-white shadow-soft-lg">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
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
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {NAV.map((n) => {
                const on = active === n.key;
                const badge = n.key === "messages" ? unread.messages : n.key === "notifications" ? unread.notifications : 0;
                return (
                  <Link key={n.key} href={n.href}
                    className={`flex items-center gap-3 rounded-m px-3 py-2.5 text-sm font-medium transition ${
                      on ? "bg-tint text-primary-dark" : "text-sub hover:bg-bg hover:text-ink"
                    }`}>
                    <n.Icon className={`text-[18px] ${on ? "text-primary" : "text-sub"}`} />
                    {n.label}
                    {badge > 0 && (
                      <span className="ms-auto grid h-5 min-w-5 place-content-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <Link href="/support" className="m-3 flex items-center gap-2 rounded-m bg-tint px-3 py-3 text-sm text-primary-dark">
              <HeadsetIcon className="text-[18px]" />
              <span>تحتاج مساعدة؟<br /><span className="font-bold">تواصل مع الدعم</span></span>
            </Link>
          </div>
        </div>
      )}

      {/* ── main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/90 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="القائمة"
              aria-expanded={navOpen}
              className="grid h-10 w-10 place-content-center rounded-full text-[22px] text-sub transition hover:bg-tint hover:text-primary-dark lg:hidden"
            >
              <MenuIcon />
            </button>
            <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <BarChartIcon className="text-[18px] text-primary" /> لوحة التحكم
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/notifications" aria-label="الإشعارات" className="relative grid h-10 w-10 place-content-center rounded-full text-[19px] text-sub transition hover:bg-tint hover:text-primary-dark">
              <BellIcon />
              <CountBadge count={unread.notifications} />
            </Link>
            <Link href="/messages" aria-label="الرسائل" className="relative grid h-10 w-10 place-content-center rounded-full text-[19px] text-sub transition hover:bg-tint hover:text-primary-dark">
              <EnvelopeIcon />
              <CountBadge count={unread.messages} />
            </Link>
            <Link href="/support" aria-label="المساعدة" className="grid h-10 w-10 place-content-center rounded-full text-[19px] text-sub transition hover:bg-tint hover:text-primary-dark">
              <HeadsetIcon />
            </Link>
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="حسابي"
                className="flex items-center rounded-full ring-2 ring-line transition hover:ring-primary">
                <Avatar name={name} src={me?.avatar_url} className="h-9 w-9" textClassName="text-sm" />
              </button>
              {menuOpen && (
                <div className="absolute end-0 mt-2 w-52 overflow-hidden rounded-l border border-line bg-white py-1.5 text-right shadow-soft-lg">
                  <Link href="/me/profile" className="block px-4 py-2.5 text-sm text-ink transition hover:bg-tint">الملف الشخصي</Link>
                  <Link href="/settings" className="block px-4 py-2.5 text-sm text-ink transition hover:bg-tint">الإعدادات</Link>
                  <button type="button" onClick={logout} className="block w-full px-4 py-2.5 text-right text-sm text-danger transition hover:bg-danger-t">تسجيل الخروج</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-5 py-6 transition-all duration-300 ease-out sm:px-7">
          {(title || headerActions) && (
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                {title && <h1 className="text-2xl font-extrabold text-ink">{title}</h1>}
                {subtitle && <p className="mt-1 text-sm text-sub">{subtitle}</p>}
              </div>
              {headerActions}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import {
  BarChartIcon, BellIcon, BriefcaseIcon, ClipboardIcon, CompassIcon, EnvelopeIcon, GearIcon,
  GridIcon, HeadsetIcon, ShieldIcon, SparklesIcon, StarIcon, UserIcon, WalletIcon,
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
  { key: "tasks", label: "مهامي", href: "/contracts", Icon: BriefcaseIcon },
  { key: "services", label: "خدماتي المميزة", href: "/me/services", Icon: SparklesIcon },
  { key: "portfolio", label: "معرض أعمالي", href: "/me/profile", Icon: GridIcon },
  { key: "messages", label: "الرسائل", href: "/messages", Icon: EnvelopeIcon },
  { key: "wallet", label: "المحفظة", href: "/wallet", Icon: WalletIcon },
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tokens.access) api<Me>("/auth/me").then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function logout() {
    api("/auth/logout", { method: "POST", body: JSON.stringify({ refresh: tokens.refresh }) }).catch(() => {});
    tokens.clear();
    window.location.href = "/";
  }

  const name = me ? `${me.first_name} ${me.last_name}`.trim() || "حسابي" : "حسابي";

  return (
    <div dir="rtl" className="flex min-h-screen bg-bg">
      {/* ── sidebar (right in RTL) ── */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-line bg-white lg:flex">
        <Link href="/" className="flex items-center gap-2 border-b border-line px-6 py-4">
          <Logo tone="brand" className="h-8 w-auto" />
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((n) => {
            const on = active === n.key;
            return (
              <Link key={n.key} href={n.href}
                className={`flex items-center gap-3 rounded-m px-3 py-2.5 text-sm font-medium transition ${
                  on ? "bg-tint text-primary-dark" : "text-sub hover:bg-bg hover:text-ink"
                }`}>
                <n.Icon className={`text-[18px] ${on ? "text-primary" : "text-sub"}`} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/support" className="m-3 flex items-center gap-2 rounded-m bg-tint px-3 py-3 text-sm text-primary-dark">
          <HeadsetIcon className="text-[18px]" />
          <span>تحتاج مساعدة؟<br /><span className="font-bold">تواصل مع الدعم</span></span>
        </Link>
      </aside>

      {/* ── main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/90 px-5 py-3 backdrop-blur">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <BarChartIcon className="text-[18px] text-primary" /> لوحة التحكم
          </Link>
          <div className="flex items-center gap-1.5">
            <Link href="/notifications" aria-label="الإشعارات" className="grid h-9 w-9 place-content-center rounded-full text-[19px] text-sub transition hover:bg-tint hover:text-primary-dark">
              <BellIcon />
            </Link>
            <Link href="/messages" aria-label="الرسائل" className="grid h-9 w-9 place-content-center rounded-full text-[19px] text-sub transition hover:bg-tint hover:text-primary-dark">
              <EnvelopeIcon />
            </Link>
            <Link href="/support" aria-label="المساعدة" className="grid h-9 w-9 place-content-center rounded-full text-[19px] text-sub transition hover:bg-tint hover:text-primary-dark">
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

        <main className="min-w-0 flex-1 px-5 py-6 sm:px-7">
          {/* mobile nav (sidebar is desktop-only) */}
          <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
            {NAV.slice(0, 7).map((n) => (
              <Link key={n.key} href={n.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${active === n.key ? "bg-primary text-white" : "bg-white text-sub ring-1 ring-line"}`}>
                {n.label}
              </Link>
            ))}
          </div>

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

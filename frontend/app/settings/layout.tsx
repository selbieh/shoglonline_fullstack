"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* Unified account-settings shell (موحد بين المستقل وصاحب العمل — ppt slide-30). Sidebar +
   content. Balance & favorites link out to their existing pages; account/payouts/payment-methods
   live under /settings. */

const NAV = [
  { href: "/settings", label: "معلومات الحساب" },
  { href: "/wallet", label: "الرصيد" },
  { href: "/invoices", label: "الفواتير" },
  { href: "/settings/payouts", label: "استلام الأرباح" },
  { href: "/me/favorites", label: "المفضلة" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">الإعدادات</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">→ لوحتي</a>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-4">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <nav className="card flex gap-1 overflow-x-auto p-2 lg:flex-col">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-m px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-tint text-primary-dark" : "text-sub hover:bg-tint hover:text-primary-dark"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="space-y-6 lg:col-span-3">{children}</div>
      </div>
    </main>
  );
}

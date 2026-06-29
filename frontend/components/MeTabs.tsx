"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SparklesIcon, UserIcon } from "@/components/icons";

/* Shared sub-nav for the freelancer's own profile + services. Both pages live under
   DashboardShell, so this segmented strip lets the freelancer flip between editing the
   profile and managing services without hunting through the sidebar (one cohesive section). */

type IconCmp = (props: { className?: string }) => JSX.Element;

const TABS: { key: string; label: string; href: string; Icon: IconCmp }[] = [
  { key: "profile", label: "ملفي الشخصي", href: "/me/profile", Icon: UserIcon },
  { key: "services", label: "خدماتي", href: "/me/services", Icon: SparklesIcon },
];

export default function MeTabs({ active, className = "" }: { active?: string; className?: string }) {
  const pathname = usePathname() || "";
  return (
    <div className={`inline-flex gap-1 rounded-l border border-line bg-white p-1 ${className}`} role="tablist">
      {TABS.map((t) => {
        const on = active ? active === t.key : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link key={t.key} href={t.href} role="tab" aria-selected={on}
            className={`inline-flex items-center gap-1.5 rounded-m px-4 py-2 text-sm font-bold transition ${
              on ? "bg-primary text-white shadow-sm" : "text-sub hover:bg-tint hover:text-primary-dark"
            }`}>
            <t.Icon className="text-[16px]" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

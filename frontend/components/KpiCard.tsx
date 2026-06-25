import type { ReactNode } from "react";

/* KPI / balance stat card (ppt slides 13/24/28/32). Tone-colored icon tile + label + large value
   + optional subtitle. Links when href is given. Server-renderable. */

export default function KpiCard({
  icon,
  label,
  value,
  subtitle,
  tone = "bg-tint text-primary-dark",
  href,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  subtitle?: string;
  tone?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className={`icon-tile h-10 w-10 shrink-0 text-[18px] sm:h-12 sm:w-12 sm:text-[20px] ${tone}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-xs text-sub">{label}</p>
          <p className="mt-0.5 truncate text-xl font-extrabold text-ink sm:text-2xl" dir="auto">{value}</p>
        </div>
      </div>
      {subtitle && <p className="mt-2 text-xs text-sub">{subtitle}</p>}
    </>
  );
  return href
    ? <a href={href} className="card-modern block p-4 sm:p-5">{inner}</a>
    : <div className="card-modern p-4 sm:p-5">{inner}</div>;
}

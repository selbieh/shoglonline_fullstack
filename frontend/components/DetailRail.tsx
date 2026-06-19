import type { ReactNode } from "react";

/* Structured icon + label + value detail rail (ppt slides 20/22 «بيانات العمل/الخدمة»). A titled
   card holding RailRow entries — each an icon chip, a muted label, and a strong value. */

export function DetailRail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-4 border-b border-line pb-3 text-sm font-bold text-ink">{title}</h2>
      <dl className="space-y-4">{children}</dl>
    </div>
  );
}

export function RailRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-content-center rounded-m bg-tint text-[16px] text-primary-dark">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-sub">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold text-ink">{value}</dd>
      </div>
    </div>
  );
}

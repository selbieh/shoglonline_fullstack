import type { ReactNode } from "react";

/* Centered empty state with icon badge + headline + subtext + optional CTA (ppt slides 36/43 and
   every "no data yet" surface). Server-renderable. */

export default function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-l border border-dashed border-line bg-bg px-6 py-12 text-center">
      {icon && (
        <span className="mb-3 grid h-14 w-14 place-content-center rounded-full bg-tint text-2xl text-primary-dark">{icon}</span>
      )}
      <p className="font-bold text-ink">{title}</p>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-sub">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

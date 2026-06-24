"use client";

/**
 * Listing-page filter sidebar wrapper with a mobile-only collapse.
 *
 * On desktop (lg+) it is the familiar sticky right-hand rail — always visible.
 * On phones the filter controls would otherwise sit *below* the whole results
 * list (the page is a flex column, results first). This wrapper:
 *   1. uses `order-first` so the rail is lifted to the TOP of the column on mobile,
 *   2. collapses its contents behind a "تصفية النتائج" toggle so it stays compact,
 *   3. surfaces the active-filter count on the toggle so applied filters are visible
 *      without opening the panel.
 */
import { useState, type ReactNode } from "react";
import { ChevronDownIcon, FilterIcon } from "@/components/icons";

export default function FilterPanel({
  activeCount = 0,
  children,
}: {
  activeCount?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="order-first w-full shrink-0 space-y-4 lg:order-none lg:sticky lg:top-6 lg:w-80 lg:self-start">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-m border border-line bg-white px-4 py-3 text-sm font-bold text-ink shadow-card lg:hidden"
      >
        <span className="flex items-center gap-2">
          <FilterIcon className="text-[18px] text-primary" />
          تصفية النتائج
          {activeCount > 0 && (
            <span className="grid h-5 min-w-[1.25rem] place-content-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
              {activeCount.toLocaleString("ar-EG")}
            </span>
          )}
        </span>
        <ChevronDownIcon className={`text-[18px] text-sub transition ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`${open ? "block" : "hidden"} space-y-4 lg:block`}>{children}</div>
    </aside>
  );
}

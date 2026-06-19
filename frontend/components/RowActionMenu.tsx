"use client";

import { useEffect, useRef, useState } from "react";

/* Reusable per-row "⋮" action dropdown (ppt slides 14/16). Items can navigate (href) or run a
   handler (onSelect); gate with `disabled`/`hidden`, flag destructive ones with `danger`. */

export type RowAction = {
  label: string;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
};

export default function RowActionMenu({ actions, label = "إجراءات" }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-content-center rounded-full text-xl leading-none text-sub transition hover:bg-tint hover:text-primary"
      >
        ⋮
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-20 mt-1 w-48 overflow-hidden rounded-m border border-line bg-white py-1 shadow-pop">
          {visible.map((a, i) => {
            const cls = `flex w-full items-center gap-2 px-3 py-2 text-right text-sm transition disabled:opacity-40 ${a.danger ? "text-danger hover:bg-danger-t" : "text-ink hover:bg-tint"}`;
            if (a.href && !a.disabled) {
              return (
                <a key={i} href={a.href} role="menuitem" className={cls} onClick={() => setOpen(false)}>
                  {a.label}
                </a>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={a.disabled}
                className={cls}
                onClick={() => { setOpen(false); a.onSelect?.(); }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

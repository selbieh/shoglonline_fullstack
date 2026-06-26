"use client";

/**
 * Searchable single-select skill combobox (replaces the flat native <select>).
 *
 * Why: the skills catalog is long (dozens of entries) and a native dropdown can't
 * be type-filtered, so finding "رياكت" means scrolling a wall of options. This
 * collapses to ONE trigger; clicking opens a popover with a type-to-filter input
 * and the matching skills. The filter input lives INSIDE the popover, so the page
 * never shows a stray second search box.
 *
 * Two usage modes via `value`:
 *   - value = "" (uncontrolled-ish): trigger always shows `placeholder`; pick fires
 *     onSelect and the caller adds the skill immediately (profile page).
 *   - value = an id: trigger shows that skill's name; pick updates a draft before a
 *     separate "add" step (onboarding wizard).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@/components/icons";
import { normalizeArabic as norm } from "@/lib/arabic";

export type SkillOption = { id: number; name_ar: string };

export default function SkillPicker({
  options,
  value,
  onSelect,
  placeholder = "+ أضف مهارة",
  searchPlaceholder = "ابحث عن مهارة…",
  className = "",
}: {
  options: SkillOption[];
  value: string; // "" = nothing selected (trigger shows placeholder)
  onSelect: (id: number) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = value ? options.find((o) => String(o.id) === value) ?? null : null;

  const nq = norm(query);
  const rows = useMemo(
    () => (nq ? options.filter((o) => norm(o.name_ar).includes(nq)) : options),
    [options, nq]
  );

  // Open: clear filter, focus the input, point the cursor at the first row.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Keep the cursor in range as the filtered list shrinks.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  // Close on click-outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Scroll the active row into view as the cursor moves.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(o: SkillOption) {
    onSelect(o.id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) choose(rows[active]);
    }
  }

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {/* trigger — a picker, NOT a search box */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field flex w-full items-center gap-2 text-start"
      >
        <span className={`flex-1 truncate ${selected ? "font-semibold text-ink" : "text-sub"}`}>
          {selected ? selected.name_ar : placeholder}
        </span>
        <ChevronDownIcon className={`shrink-0 text-[18px] text-sub transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-m border border-line bg-white shadow-soft-lg"
          role="listbox"
        >
          <div className="relative border-b border-line p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full rounded-m bg-bg px-3 py-2.5 pe-9 text-[15px] text-ink placeholder:text-sub/55 focus:outline-none"
            />
            <SearchIcon className="absolute inset-y-0 end-5 my-auto text-[17px] text-sub" />
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
            {rows.map((o, i) => {
              const isSel = String(o.id) === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  data-row={i}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={`flex w-full items-center gap-2 rounded-m px-2.5 py-2 text-start text-sm transition ${
                    active === i ? "bg-tint" : ""
                  } ${isSel ? "font-bold text-primary-dark" : "text-ink"}`}
                >
                  <span className="flex-1 truncate">{o.name_ar}</span>
                  {isSel && <CheckIcon className="shrink-0 text-[16px] text-primary" />}
                </button>
              );
            })}

            {rows.length === 0 && <p className="px-3 py-6 text-center text-sub">لا توجد مهارة مطابقة</p>}
          </div>
        </div>
      )}
    </div>
  );
}

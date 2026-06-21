"use client";

/**
 * Searchable single-select category combobox (replaces the flat radio list).
 *
 * Why: a radio per category doesn't scale — at dozens/hundreds of categories the
 * sidebar becomes an unusable wall. This control collapses to ONE field showing
 * the current selection; clicking opens a popover with a type-to-filter input and
 * a grouped parent→child list. Crucially the filter input lives INSIDE the popover,
 * so the page never shows two search boxes at once — no confusion with the main
 * "search listings" box next to it.
 *
 * Selection model (maps onto the existing category/subcategory params):
 *   - "all"          → onSelect(null)
 *   - a parent       → onSelect({ id, parentId: null })
 *   - a child        → onSelect({ id, parentId })
 * `selectedId` is the effective selection (a parent OR a child id, "" = all).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@/components/icons";

export type CatNode = {
  id: number;
  slug: string;
  name_ar: string;
  icon?: string;
  children?: CatNode[];
};

export type CategorySelection = { id: string; parentId: string | null } | null;

/** Arabic-aware normalisation so "ابداع" matches "إبداع", diacritics are ignored, etc. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "") // tashkeel / diacritics
    .replace(/[إأآا]/g, "ا") // unify alef forms
    .replace(/[ىئ]/g, "ي") // alef-maqsura / hamza-on-ya → ya
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه") // ta-marbuta → ha
    .replace(/\s+/g, " ")
    .trim();
}

export default function CategoryFilter({
  categories,
  selectedId,
  onSelect,
  label = "الفئة",
  allLabel = "كل الفئات",
  searchPlaceholder = "ابحث عن فئة…",
}: {
  categories: CatNode[];
  selectedId: string; // "" = all
  onSelect: (sel: CategorySelection) => void;
  label?: string;
  allLabel?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flat index id→node and id→parentId, so we can resolve the current selection
  // (which may be a parent or a child) and render its label/icon on the trigger.
  const { byId, parentOf } = useMemo(() => {
    const byId = new Map<string, CatNode>();
    const parentOf = new Map<string, CatNode | null>();
    for (const p of categories) {
      byId.set(String(p.id), p);
      parentOf.set(String(p.id), null);
      for (const c of p.children ?? []) {
        byId.set(String(c.id), c);
        parentOf.set(String(c.id), p);
      }
    }
    return { byId, parentOf };
  }, [categories]);

  const selectedNode = selectedId ? byId.get(selectedId) ?? null : null;

  // Visible groups for the current query + expand state.
  const nq = norm(query);
  const matches = (n: CatNode) => norm(n.name_ar).includes(nq);
  const groups = useMemo(() => {
    return categories
      .map((parent) => {
        const kids = parent.children ?? [];
        const pMatch = !nq || matches(parent);
        const matchKids = nq ? kids.filter(matches) : kids;
        const visible = !nq ? true : pMatch || matchKids.length > 0;
        if (!visible) return null;
        // No query → reveal kids only when this parent is expanded.
        // Query → reveal matching kids (or all kids if the parent name matched).
        const shownKids = nq
          ? matchKids.length
            ? matchKids
            : pMatch
              ? kids
              : []
          : expanded.has(parent.id)
            ? kids
            : [];
        return { parent, kids, shownKids };
      })
      .filter(Boolean) as { parent: CatNode; kids: CatNode[]; shownKids: CatNode[] }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, nq, expanded]);

  // Flattened selectable rows in render order — drives Up/Down/Enter keyboard nav.
  const rows = useMemo(() => {
    const r: CategorySelection[] = [null]; // the "all" row
    for (const g of groups) {
      r.push({ id: String(g.parent.id), parentId: null });
      for (const c of g.shownKids) r.push({ id: String(c.id), parentId: String(g.parent.id) });
    }
    return r;
  }, [groups]);

  // Open: focus the filter, reveal the selected branch, point the cursor at it.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const parent = selectedId ? parentOf.get(selectedId) : null;
    setExpanded(parent ? new Set([parent.id]) : new Set());
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the active row in sync: highlight the current selection, or — while
  // filtering — the first match, so Enter picks a real result (not "all").
  useEffect(() => {
    const i = rows.findIndex((r) => (r?.id ?? "") === selectedId);
    if (i >= 0) setActive(i);
    else setActive(nq && rows.length > 1 ? 1 : 0);
  }, [rows, selectedId, nq]);

  // Close on click-outside / Escape.
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

  function choose(sel: CategorySelection) {
    onSelect(sel);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active] !== undefined) choose(rows[active]);
    }
  }

  return (
    <div className="space-y-1.5 text-sm" ref={rootRef}>
      <p className="text-xs font-medium text-sub">{label}</p>
      <div className="relative">
        {/* trigger — a picker (selected value + chevron), NOT a search box */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="field flex items-center gap-2 py-3 text-start"
        >
          {selectedNode ? (
            <CategoryIcon icon={selectedNode.icon} slug={selectedNode.slug} className="shrink-0 text-[18px] text-primary" />
          ) : null}
          <span className={`flex-1 truncate ${selectedNode ? "font-semibold text-ink" : "text-sub"}`}>
            {selectedNode ? selectedNode.name_ar : allLabel}
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
              {/* all */}
              <Row
                index={0}
                active={active === 0}
                selected={selectedId === ""}
                onActivate={() => setActive(0)}
                onClick={() => choose(null)}
              >
                <span className="flex-1">{allLabel}</span>
              </Row>

              {groups.map((g) => {
                const pid = String(g.parent.id);
                const pIndex = rows.findIndex((r) => r?.id === pid && r?.parentId === null);
                const isExpanded = !nq && expanded.has(g.parent.id);
                return (
                  <div key={pid}>
                    <Row
                      index={pIndex}
                      active={active === pIndex}
                      selected={selectedId === pid}
                      onActivate={() => setActive(pIndex)}
                      onClick={() => choose({ id: pid, parentId: null })}
                    >
                      <CategoryIcon icon={g.parent.icon} slug={g.parent.slug} className="shrink-0 text-[17px] text-primary" />
                      <span className="flex-1 truncate font-semibold">{g.parent.name_ar}</span>
                      {!nq && g.kids.length > 0 && (
                        <span
                          role="button"
                          tabIndex={-1}
                          aria-label={isExpanded ? "إخفاء التخصصات" : "عرض التخصصات"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              next.has(g.parent.id) ? next.delete(g.parent.id) : next.add(g.parent.id);
                              return next;
                            });
                          }}
                          className="-me-1 grid h-6 w-6 shrink-0 place-content-center rounded text-sub transition hover:bg-bg hover:text-primary"
                        >
                          <ChevronDownIcon className={`text-[16px] transition ${isExpanded ? "rotate-180" : ""}`} />
                        </span>
                      )}
                    </Row>

                    {g.shownKids.map((c) => {
                      const cid = String(c.id);
                      const cIndex = rows.findIndex((r) => r?.id === cid && r?.parentId === pid);
                      return (
                        <Row
                          key={cid}
                          index={cIndex}
                          active={active === cIndex}
                          selected={selectedId === cid}
                          indent
                          onActivate={() => setActive(cIndex)}
                          onClick={() => choose({ id: cid, parentId: pid })}
                        >
                          <span className="flex-1 truncate">{c.name_ar}</span>
                        </Row>
                      );
                    })}
                  </div>
                );
              })}

              {groups.length === 0 && (
                <p className="px-3 py-6 text-center text-sub">لا توجد فئة مطابقة</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A single selectable option row inside the popover. */
function Row({
  index,
  active,
  selected,
  indent,
  onActivate,
  onClick,
  children,
}: {
  index: number;
  active: boolean;
  selected: boolean;
  indent?: boolean;
  onActivate: () => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-row={index}
      role="option"
      aria-selected={selected}
      onMouseEnter={onActivate}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-m px-2.5 py-2 text-start text-sm transition ${
        indent ? "ps-7" : ""
      } ${active ? "bg-tint" : ""} ${selected ? "font-bold text-primary-dark" : "text-ink"}`}
    >
      {children}
      {selected && <CheckIcon className="shrink-0 text-[16px] text-primary" />}
    </button>
  );
}

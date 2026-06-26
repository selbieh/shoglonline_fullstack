"use client";

/* Status-filter tab bar with per-status counts — the recurring dashboard pattern across
   مهامي / عروضي / خدماتي (ppt slides 13/15/17). Uses the .tabs/.tab/.tab-count classes
   from globals.css. The "all" tab uses value "" and reads counts["all"]. */

export type StatusTab = { value: string; label: string };

export default function StatusTabs({
  tabs,
  active,
  counts,
  onChange,
}: {
  tabs: StatusTab[];
  active: string;
  counts?: Record<string, number>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => {
        const n = counts?.[t.value || "all"];
        const isActive = active === t.value;
        return (
          <button
            key={t.value || "all"}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.value)}
            className={`tab ${isActive ? "tab-active" : ""}`}
          >
            {t.label}
            {typeof n === "number" && <span className="tab-count">{n.toLocaleString("en-US")}</span>}
          </button>
        );
      })}
    </div>
  );
}

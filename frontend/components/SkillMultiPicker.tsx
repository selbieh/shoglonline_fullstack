"use client";

import SkillPicker, { type SkillOption } from "@/components/SkillPicker";

/**
 * Catalog-backed MULTI-select for skills, built on the single-select SkillPicker (which the
 * profile/onboarding pages already use). It appends the picked skill's NAME to a list and renders
 * the chosen skills as removable chips above the picker.
 *
 * Values are the catalog's `name_ar` strings — portfolio items store skills as free strings, so
 * keeping names (not ids) means the backend storage and the gallery's `?skill=` text filter keep
 * working unchanged, while new picks now draw from the shared catalog vocabulary. Any pre-existing
 * value that ISN'T in the catalog (legacy free-text) still shows as a removable chip; it just can't
 * be re-picked from the list.
 */
export default function SkillMultiPicker({
  catalog,
  value,
  onChange,
  placeholder = "+ أضف مهارة",
}: {
  catalog: SkillOption[];
  value: string[];
  onChange: (skills: string[]) => void;
  placeholder?: string;
}) {
  const available = catalog.filter((c) => !value.includes(c.name_ar));
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full bg-tint px-3 py-1 text-sm font-medium text-primary-dark"
            >
              {s}
              <button
                type="button"
                aria-label={`حذف ${s}`}
                className="text-danger transition hover:opacity-70"
                onClick={() => onChange(value.filter((x) => x !== s))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {available.length > 0 ? (
        <SkillPicker
          options={available}
          value=""
          placeholder={placeholder}
          onSelect={(id) => {
            const opt = catalog.find((c) => c.id === id);
            if (opt && !value.includes(opt.name_ar)) onChange([...value, opt.name_ar]);
          }}
        />
      ) : (
        catalog.length === 0 && <p className="text-sm text-sub">جارٍ تحميل المهارات…</p>
      )}
    </div>
  );
}

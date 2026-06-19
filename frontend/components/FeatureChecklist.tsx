import { CheckIcon } from "@/components/icons";

/* Check-icon feature list (ppt slides 21/22 «مميزات المشروع / ماذا ستحصل عليه»). Server-renderable. */

export default function FeatureChecklist({ items, columns = 2 }: { items: string[]; columns?: 1 | 2 }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className={`grid gap-x-6 gap-y-2.5 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-ink/80">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-content-center rounded-full bg-success-t text-[12px] text-success">
            <CheckIcon />
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

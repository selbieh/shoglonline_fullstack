import { StarIcon } from "@/components/icons";

/** Read-only 5-star rating with the numeric value + optional review count (RTL-safe). */
export default function StarRating({
  value,
  count,
  size = "text-[15px]",
  className = "",
}: {
  value: number;
  count?: number;
  size?: string;
  className?: string;
}) {
  const full = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="flex text-star" dir="ltr" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <StarIcon key={i} filled={i < full} className={`${size} ${i < full ? "text-star" : "text-line"}`} />
        ))}
      </span>
      <span className="text-sm font-bold text-ink" dir="ltr">{value.toFixed(1)}</span>
      {count != null && <span className="text-xs text-sub">({count.toLocaleString("ar-EG")})</span>}
    </span>
  );
}

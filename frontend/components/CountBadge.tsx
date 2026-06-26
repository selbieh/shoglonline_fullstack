/** Small red unread-count pill overlaid on a header icon. Renders nothing at 0. */
export default function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="pointer-events-none absolute -left-0.5 -top-0.5 grid h-4 min-w-4 place-content-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white shadow-sm">
      {count > 9 ? "9+" : count}
    </span>
  );
}

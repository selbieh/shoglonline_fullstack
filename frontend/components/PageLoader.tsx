import Logo from "@/components/Logo";

type PageLoaderProps = {
  /** When true, fills the viewport (centered). Default for full-page route loads. */
  fullScreen?: boolean;
  className?: string;
};

/**
 * Branded loading state: the wordmark with a soft pulse above a periwinkle
 * spinner ring. Replaces bare "جارٍ التحميل…" text on full-page loads so the
 * wait feels on-brand. Pair with `fullScreen` for route-level blocking loads,
 * or drop inline (fullScreen={false}) inside a card/section.
 */
export default function PageLoader({ fullScreen = true, className = "" }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`grid place-content-center justify-items-center gap-5 ${
        fullScreen ? "min-h-screen" : "py-16"
      } ${className}`}
    >
      <Logo className="h-9 w-auto animate-pulse" priority />
      <span
        aria-hidden
        className="h-7 w-7 animate-spin rounded-full border-2 border-tint border-t-primary"
      />
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  );
}

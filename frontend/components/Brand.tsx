/* Reusable brand SVG art & decorations (server-safe — pure SVG, no hooks).
   Palette: #737AC9 / #565DAE / #424783 / tint #E9ECFA. */

/** Decorative gradient blobs for hero/section backgrounds. Place inside a
    relative + overflow-hidden parent; pointer-events-none so it never blocks UI. */
export function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
      <div className="absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
    </div>
  );
}

/** Bottom wave divider (fills with the page bg by default). */
export function Wave({ fill = "#F6F7FD", className = "" }: { fill?: string; className?: string }) {
  return (
    <svg viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden
      className={`block w-full ${className}`}>
      <path d="M0 80V28c220 36 480 40 720 14S1220-6 1440 22v58z" fill={fill} />
    </svg>
  );
}

/** Marketplace hero illustration — the official `export/` freelancer character
    (`public/brand/illustration-freelancer.svg`). Decorative. */
export function HeroIllustration({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/brand/illustration-freelancer.svg"
      alt=""
      aria-hidden
      className={className}
    />
  );
}

/** A floating rating/review chip from the `export/` set (Frame 20–23). `n` ∈ 1..4.
    Position it with absolute utilities from the parent (see the landing hero). */
export function RatingChip({ n = 1, className = "" }: { n?: 1 | 2 | 3 | 4; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`/brand/rating-chip-${n}.svg`}
      alt=""
      aria-hidden
      className={`drop-shadow-lg ${className}`}
    />
  );
}

/** Sign-in panel line-art: a reviews window (star ratings) + a key, matching the client PDF. */
export function SigninArt({ className = "" }: { className?: string }) {
  const ink = "#2A2D45";
  return (
    <svg viewBox="0 0 440 380" className={className} role="img" aria-label="تسجيل دخول آمن" fill="none">
      {/* back card */}
      <rect x="150" y="78" width="150" height="210" rx="16" fill="#EEF0FB" stroke={ink} strokeWidth="4" />
      {[120, 150, 180, 210, 240].map((y) => (
        <rect key={y} x="168" y={y} width="36" height="12" rx="6" fill="#DADDEC" />
      ))}

      {/* front browser window */}
      <g>
        <rect x="40" y="100" width="220" height="200" rx="16" fill="#FFFFFF" stroke={ink} strokeWidth="4" />
        <path d="M40 130a16 16 0 0 1 16-16h188a16 16 0 0 1 16 16v8H40z" fill="#E9ECFA" stroke={ink} strokeWidth="4" />
        <circle cx="64" cy="124" r="4" fill={ink} />
        <circle cx="80" cy="124" r="4" fill={ink} />
        <circle cx="96" cy="124" r="4" fill={ink} />

        {/* three review rows, each with 5 stars + text lines */}
        {[160, 210, 260].map((y) => (
          <g key={y}>
            {[0, 1, 2, 3, 4].map((i) => (
              <path
                key={i}
                d={`M${200 - i * 18} ${y}l3.2 6.5 7.2 1-5.2 5.1 1.2 7.1-6.4-3.4-6.4 3.4 1.2-7.1-5.2-5.1 7.2-1z`}
                fill="#FED26C"
              />
            ))}
            <rect x="60" y={y + 2} width="64" height="10" rx="5" fill="#C9CEE6" />
            <rect x="60" y={y + 20} width="40" height="8" rx="4" fill="#DADDEC" />
          </g>
        ))}
      </g>

      {/* key */}
      <g transform="translate(196 250)">
        <circle cx="34" cy="34" r="30" fill="#737AC9" stroke={ink} strokeWidth="4" />
        <circle cx="34" cy="34" r="12" fill="#FFFFFF" stroke={ink} strokeWidth="4" />
        <path d="M58 46l46 46" stroke={ink} strokeWidth="12" strokeLinecap="round" />
        <path d="M58 46l46 46" stroke="#737AC9" strokeWidth="6" strokeLinecap="round" />
        <path d="M86 74l14-14M98 86l12-12" stroke={ink} strokeWidth="9" strokeLinecap="round" />
      </g>
    </svg>
  );
}

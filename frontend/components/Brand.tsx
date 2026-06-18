/* Reusable brand SVG art & decorations (server-safe — pure SVG, no hooks).
   Palette: #6C70DC / #5155BE / #3E418F / tint #E9ECFA. */

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

/** Rich marketplace hero illustration. */
export function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 380" className={className} role="img"
      aria-label="منصة العمل الحر" fill="none">
      <defs>
        <linearGradient id="bAvatar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A6ABE9" /><stop offset="1" stopColor="#5155BE" />
        </linearGradient>
        <linearGradient id="bCard" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#EEF0FB" />
        </linearGradient>
        <filter id="bShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#3E418F" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* halo */}
      <circle cx="250" cy="180" r="170" fill="#ffffff" opacity="0.06" />
      <circle cx="250" cy="180" r="120" fill="#ffffff" opacity="0.06" />

      {/* main job card */}
      <g filter="url(#bShadow)">
        <rect x="70" y="60" width="250" height="170" rx="20" fill="url(#bCard)" />
        <rect x="94" y="90" width="44" height="44" rx="12" fill="#E9ECFA" />
        <path d="M104 112h24M104 122h24" stroke="#6C70DC" strokeWidth="3" strokeLinecap="round" />
        <rect x="150" y="92" width="120" height="13" rx="6" fill="#3E418F" />
        <rect x="150" y="114" width="86" height="9" rx="4" fill="#B9BED9" />
        <rect x="94" y="150" width="200" height="8" rx="4" fill="#DADDEC" />
        <rect x="94" y="166" width="170" height="8" rx="4" fill="#DADDEC" />
        <rect x="94" y="192" width="74" height="24" rx="12" fill="#E3F5EC" />
        <path d="M108 204h6m12 0h18" stroke="#1B8A5A" strokeWidth="3" strokeLinecap="round" />
        <rect x="182" y="192" width="60" height="24" rx="12" fill="#E9ECFA" />
      </g>

      {/* worker avatar bubble */}
      <g filter="url(#bShadow)">
        <circle cx="360" cy="150" r="58" fill="url(#bAvatar)" />
        <circle cx="360" cy="132" r="19" fill="#fff" />
        <path d="M332 178c0-16 12-27 28-27s28 11 28 27" fill="#fff" />
      </g>

      {/* escrow / wallet chip */}
      <g filter="url(#bShadow)">
        <rect x="150" y="262" width="190" height="80" rx="18" fill="#3E418F" />
        <rect x="174" y="286" width="96" height="10" rx="5" fill="#888EE2" />
        <rect x="174" y="306" width="66" height="16" rx="8" fill="#fff" />
        <circle cx="306" cy="306" r="18" fill="#1B8A5A" />
        <path d="M299 306l5 5 9-10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* sparkles */}
      <path d="M408 250l5 14 14 5-14 5-5 14-5-14-14-5 14-5z" fill="#fff" opacity="0.5" />
      <circle cx="96" cy="276" r="7" fill="#fff" opacity="0.5" />
    </svg>
  );
}

/** Build the next/image remote allow-list from env hosts (backend media + Google avatars). */
function imageHosts() {
  const hosts = new Set(["lh3.googleusercontent.com"]); // Google sign-in avatars
  for (const v of [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_MEDIA_URL]) {
    try {
      if (v) hosts.add(new URL(v).hostname);
    } catch {
      /* ignore malformed env */
    }
  }
  return [...hosts].flatMap((hostname) => [
    { protocol: "https", hostname },
    { protocol: "http", hostname },
  ]);
}

// Security headers applied to every frontend response. The Django backend sets its own header set
// (incl. CSP) on API/admin responses, but those never touch the HTML the browser + Googlebot fetch
// from the Next server — so the page shell needs its own. A strict Content-Security-Policy is left
// to the reverse proxy / a staged rollout because the app embeds PayPal, Firebase, Google Identity
// and GA, whose origins must be allow-listed and verified in a browser first; the set below is the
// safe, SEO-positive baseline that can't break third-party flows.
const securityHeaders = [
  // Force HTTPS for two years incl. subdomains (honoured only over TLS, ignored on local http).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Stop MIME-sniffing (a content-type confusion / XSS vector).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Disallow being framed by other origins (clickjacking); complements the backend's frame-ancestors.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Send the origin (not the full path) on cross-origin requests — keeps referrers useful but private.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop powerful features the site never uses (PayPal's payment flow is intentionally left enabled).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow an isolated build dir (e.g. CI prod-check builds) without clobbering a running
  // `next dev` server's `.next` cache. Defaults to `.next` for normal dev/prod.
  distDir: process.env.BUILD_DIST_DIR || ".next",
  output: "standalone", // slim Docker runtime (SRS §20.1)
  poweredByHeader: false, // don't advertise the stack
  compress: true,
  images: {
    remotePatterns: imageHosts(),
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Self-hosted fonts are content-stable — cache them hard so repeat views skip the round-trip.
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;

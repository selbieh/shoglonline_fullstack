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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // slim Docker runtime (SRS §20.1)
  poweredByHeader: false, // don't advertise the stack
  compress: true,
  images: {
    remotePatterns: imageHosts(),
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;

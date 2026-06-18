/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // slim Docker runtime (SRS §20.1)
};

export default nextConfig;

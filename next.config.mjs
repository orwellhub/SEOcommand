/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  reactStrictMode: true,
  distDir: process.env.QA_DIST_DIR || ".next",
  poweredByHeader: false,
};

export default nextConfig;

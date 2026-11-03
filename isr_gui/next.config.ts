import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's build adapter handles packaging; standalone output conflicts with
  // adapter builds in Next.js 16.3 and is unnecessary for `next start` locally.
  turbopack: { root: process.cwd() },
};

export default nextConfig;

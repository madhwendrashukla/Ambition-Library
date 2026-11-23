import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E tests build into a separate folder so they never overwrite your real build
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;

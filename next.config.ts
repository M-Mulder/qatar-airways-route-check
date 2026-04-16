import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma", "playwright"],
  /** Ship Playwright + hermetic Chromium into the `/api/cron/compare` serverless bundle (Vercel). */
  outputFileTracingIncludes: {
    "/api/cron/compare": [
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*",
    ],
  },
};

export default nextConfig;

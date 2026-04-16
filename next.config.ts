import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma", "playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/cron/compare": ["./node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;

import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

loadDbEnv(root);
if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is not set. Add it to .env.local (Next.js) or .env.");
  process.exit(1);
}

execSync(
  'npx prisma db execute --file scripts/seed-mock-compare.sql --schema prisma/schema.prisma',
  { stdio: "inherit", cwd: root, env: process.env },
);

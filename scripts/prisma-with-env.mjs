/**
 * Run Prisma CLI with DATABASE_URL from `.env` / `.env.local` (same merge as Next.js scripts).
 * Usage: node scripts/prisma-with-env.mjs <prisma-args...>
 * Example: node scripts/prisma-with-env.mjs migrate deploy
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDbEnv(root);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-with-env.mjs <prisma-args...>");
  process.exit(1);
}

const r = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
  shell: true,
});
process.exit(r.status === 0 ? 0 : r.status ?? 1);

/**
 * Push selected variables from .env / .env.local into Vercel project environments.
 * Same merge order as Next.js: .env then .env.local (local overrides).
 *
 * Prerequisites: `npx vercel login` and `npx vercel link` in this repo.
 *
 * Usage:
 *   node scripts/sync-env-to-vercel.mjs
 *   node scripts/sync-env-to-vercel.mjs --preview   # also sync preview
 *
 * Does not print values. Keys: DATABASE_URL, CRON_SECRET, COMPARE_FLIGHTS (if set).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDbEnv(root);

const KEYS = ["DATABASE_URL", "CRON_SECRET", "COMPARE_FLIGHTS"];
const withPreview = process.argv.includes("--preview");
const targets = withPreview ? ["production", "preview"] : ["production"];

function vercelSpawn(args, input) {
  const opts = {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
    shell: true,
  };
  if (input) opts.input = input;
  return spawnSync("npx", ["vercel", ...args], opts);
}

for (const target of targets) {
  console.log(`\n[sync-env-to-vercel] Target: ${target}`);
  for (const key of KEYS) {
    const val = process.env[key]?.trim();
    if (!val) {
      if (key === "COMPARE_FLIGHTS") continue;
      console.warn(`[sync-env-to-vercel] Skip ${key}: not set in .env / .env.local`);
      continue;
    }
    const args = ["env", "add", key, target, "--force"];
    if (key === "DATABASE_URL" || key === "CRON_SECRET") args.push("--sensitive");
    const add = vercelSpawn(args, `${val}\n`);
    if (add.status !== 0) {
      console.error(
        `[sync-env-to-vercel] Failed to set ${key} (${target}). Log in and link the project: npx vercel login && npx vercel link`,
      );
      process.exit(add.status ?? 1);
    }
    console.log(`[sync-env-to-vercel] Set ${key} (${target})`);
  }
}

console.log("\n[sync-env-to-vercel] Done. Trigger a redeploy so builds pick up new values.");

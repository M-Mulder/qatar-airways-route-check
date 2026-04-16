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
 * Does not print values. Keys: DATABASE_URL, CRON_SECRET, COMPARE_FLIGHTS, GOOGLE_CSE_* (if set).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDbEnv(root);

const KEYS = [
  "DATABASE_URL",
  "CRON_SECRET",
  "COMPARE_FLIGHTS",
  "GOOGLE_CSE_API_KEY",
  "GOOGLE_CSE_ID",
  "AIRFLEETS_PLAYWRIGHT_GOOGLE_ENTRY",
];
const withPreview = process.argv.includes("--preview");
const targets = withPreview ? ["production", "preview"] : ["production"];

function normalizedEnvValue(key) {
  const v = process.env[key];
  if (v == null) return "";
  return v
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .replace(/^\uFEFF/, "");
}

function vercelSpawn(args, input) {
  const opts = {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
    shell: true,
  };
  if (input !== undefined) opts.input = Buffer.from(input, "utf8");
  return spawnSync("npx", ["vercel", ...args], opts);
}

for (const target of targets) {
  console.log(`\n[sync-env-to-vercel] Target: ${target}`);
  for (const key of KEYS) {
    const val = normalizedEnvValue(key);
    if (!val) {
      if (key === "COMPARE_FLIGHTS") continue;
      console.warn(`[sync-env-to-vercel] Skip ${key}: not set in .env / .env.local`);
      continue;
    }
    const args = ["env", "add", key, target, "--force"];
    if (key === "DATABASE_URL" || key === "CRON_SECRET" || key === "GOOGLE_CSE_API_KEY") args.push("--sensitive");
    // No trailing newline — Vercel rejects secrets used in headers if value has stray whitespace.
    const add = vercelSpawn(args, val);
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

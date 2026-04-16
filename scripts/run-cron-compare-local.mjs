/**
 * Call GET /api/cron/compare like Vercel Cron (Bearer CRON_SECRET).
 * Loads `.env` then `.env.local` (same as Next).
 *
 * Usage:
 *   node scripts/run-cron-compare-local.mjs
 *   node scripts/run-cron-compare-local.mjs 2026-04-15
 *
 * Requires `next dev` (or `next start`) on CRON_LOCAL_PORT (default 3000).
 * Point DATABASE_URL at the DB you want to update (local or production Postgres via `.env.local`).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDbEnv(root);

const secret = process.env.CRON_SECRET;
if (!secret?.trim()) {
  console.error("CRON_SECRET missing in .env / .env.local");
  process.exit(1);
}

const port = process.env.CRON_LOCAL_PORT || process.env.PORT || "3000";
const base = (process.env.CRON_LOCAL_BASE || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const dateArg = process.argv[2];
const url = new URL(`${base}/api/cron/compare`);
if (dateArg) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error("Optional arg must be YYYY-MM-DD");
    process.exit(1);
  }
  url.searchParams.set("date", dateArg);
}

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
  cache: "no-store",
});
const body = await res.text();
console.log(`HTTP ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}
process.exit(res.ok ? 0 : 1);

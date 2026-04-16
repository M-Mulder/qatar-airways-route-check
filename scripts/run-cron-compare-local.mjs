/**
 * Call GET /api/cron/compare like Vercel Cron (Bearer CRON_SECRET).
 * Loads `.env` then `.env.local` (same as Next).
 *
 * Use this when Vercel Hobby has already used its one daily cron, or to test
 * compare + Airfleets fetches without waiting for production.
 *
 * Usage:
 *   npm run cron:local
 *   npm run cron:local -- 2026-04-15
 *
 * Requires `next dev` (or `next start`) on CRON_LOCAL_PORT (default 3000).
 * Env: CRON_LOCAL_BASE (e.g. http://127.0.0.1:3000) overrides host/port.
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

let res;
try {
  res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
} catch (e) {
  const code = e?.cause?.code ?? e?.code;
  const isConn =
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    /fetch failed|ECONNREFUSED|connect/i.test(String(e?.message ?? e));
  if (isConn) {
    console.error(
      `Cannot reach ${url.origin}. Start the app first, then run this script again:\n` +
        `  npm run dev\n` +
        `  (in another terminal) npm run cron:local${dateArg ? ` -- ${dateArg}` : ""}`,
    );
  } else {
    console.error(e);
  }
  process.exit(1);
}
const body = await res.text();
console.log(`HTTP ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}
process.exit(res.ok ? 0 : 1);

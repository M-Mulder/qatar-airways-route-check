/**
 * CLI: run compare for one calendar date (loads .env via caller).
 *
 *   npx tsx --tsconfig tsconfig.json src/cli/run-compare-day.ts 2026-04-29
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "../../scripts/load-db-env.mjs";
import { DEFAULT_SEGMENTS, getSegmentsFromEnv } from "@/lib/config";
import { runCompareForDates } from "@/lib/compareJob";
import { loadPlannedRowsFromDatabase } from "@/lib/plannedFromDb";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
loadDbEnv(root);

const iso = process.argv[2];
if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
  console.error("Usage: npx tsx --tsconfig tsconfig.json src/cli/run-compare-day.ts YYYY-MM-DD");
  process.exit(1);
}

async function main() {
  const segments = getSegmentsFromEnv();
  const segs = segments.length ? segments : DEFAULT_SEGMENTS;
  const plannedRows = await loadPlannedRowsFromDatabase();
  const res = await runCompareForDates([iso], segs, plannedRows);
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

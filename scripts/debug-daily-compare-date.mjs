/**
 * One-off: load .env/.env.local and print DailyCompare rows for a calendar date.
 * Usage: node scripts/debug-daily-compare-date.mjs 2026-04-29
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../.prisma-client/index.js";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDbEnv(root);

const iso = process.argv[2] || "2026-04-29";
if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
  console.error("Usage: node scripts/debug-daily-compare-date.mjs YYYY-MM-DD");
  process.exit(1);
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const d = new Date(`${iso}T12:00:00.000Z`);

try {
  const dayRows = await prisma.dailyCompare.findMany({
    where: { compareDate: d },
    select: {
      compareDate: true,
      flight: true,
      routeKey: true,
      actualRegistration: true,
      matchQsuite: true,
      matchEquipment: true,
      fr24Error: true,
      airfleetsPayload: true,
    },
  });

  const payloadSummary = dayRows.map((r) => {
    const p = r.airfleetsPayload;
    const keys =
      p && typeof p === "object" && !Array.isArray(p) ? Object.keys(p).sort() : [];
    return {
      flight: r.flight,
      routeKey: r.routeKey,
      actualRegistration: r.actualRegistration,
      airfleetsPayloadNull: p == null,
      airfleetsKeys: keys,
      fetchedAt: p && typeof p === "object" ? p.fetchedAt ?? "(missing)" : null,
    };
  });

  console.log(JSON.stringify({ iso, dayRowsCount: dayRows.length, payloadSummary, dayRows }, null, 2));
} finally {
  await prisma.$disconnect();
}

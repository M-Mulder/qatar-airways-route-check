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
      matchQsuite: true,
      matchEquipment: true,
      fr24Error: true,
    },
  });

  const visible = await prisma.dailyCompare.findMany({
    where: {
      compareDate: d,
      OR: [{ matchQsuite: true }, { matchQsuite: false }, { fr24Error: { not: null } }],
    },
    select: { flight: true, routeKey: true, matchQsuite: true, fr24Error: true },
  });

  console.log(JSON.stringify({ iso, dayRowsCount: dayRows.length, dayRows, visibleCount: visible.length, visible }, null, 2));
} finally {
  await prisma.$disconnect();
}

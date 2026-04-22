import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDbEnv(root);

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is not set. Add it to .env.local (Next.js) or .env.");
  process.exit(1);
}

const { PrismaClient } = await import("../.prisma-client/index.js");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL.trim() } } });

function monthIsoNext() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function datesInMonth(monthIso) {
  const [y, m] = monthIso.split("-").map((x) => parseInt(x, 10));
  const start = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  const out = [];
  for (let dt = new Date(start); dt.getUTCMonth() === start.getUTCMonth(); dt.setUTCDate(dt.getUTCDate() + 1)) {
    const iso = dt.toISOString().slice(0, 10);
    out.push({ iso, date: new Date(`${iso}T12:00:00.000Z`) });
  }
  return out;
}

function randPick() {
  return Math.random() < 0.6 ? 43000 : 86000;
}

const monthIso = process.argv[2] && /^\d{4}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : monthIsoNext();
const flight = "QR274";
const origin = "AMS";
const destination = "DOH";
const cabin = "BUSINESS";
const program = "AVIOS";

const rows = datesInMonth(monthIso).map(({ date }) => ({
  flight,
  origin,
  destination,
  cabin,
  date,
  program,
  avios: randPick(),
}));

let upserts = 0;
for (const r of rows) {
  await prisma.awardPriceSnapshot.upsert({
    where: {
      flight_origin_destination_cabin_date_program: {
        flight: r.flight,
        origin: r.origin,
        destination: r.destination,
        cabin: r.cabin,
        date: r.date,
        program: r.program,
      },
    },
    create: r,
    update: { avios: r.avios, observedAt: new Date() },
  });
  upserts++;
}

console.log(`[seed-award-mock] upserted ${upserts} rows for ${monthIso} ${flight} ${origin}->${destination} ${cabin} ${program}`);
await prisma.$disconnect();


/**
 * Full replace: deletes all PlannedSegment rows, then loads from Qatar segments CSV
 * (same columns as schiphol_equipment_scan/qatar_segments_equipment_report.py).
 *
 * Usage: node scripts/seed-planned-segments.mjs <path-to-qatar_segments_export.csv>
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { PrismaClient } = require(join(root, ".prisma-client/index.js"));
loadDbEnv(root);

const csvPath = process.argv[2];
if (!csvPath?.trim()) {
  console.error("Usage: node scripts/seed-planned-segments.mjs <path-to-qatar_segments_export.csv>");
  process.exit(1);
}

const abs = resolve(process.cwd(), csvPath);

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function parseBool(v) {
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return null;
}

function parseIntOpt(v) {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

const text = readFileSync(abs, "utf8");
const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
if (lines.length < 2) {
  console.error("CSV has no data rows:", abs);
  process.exit(1);
}

const header = lines[0].split(",").map((h) => h.trim());
const idx = (name) => header.indexOf(name);
const iq = idx("query_date");
const ifid = idx("flight_id");
const ifn = idx("flight_number");
const io = idx("origin");
const id = idx("destination");
const idep = idx("departure_local");
const iarr = idx("arrival_local");
const ivc = idx("vehicle_code");
const ivn = idx("vehicle_name");
const ivs = idx("vehicle_short");
const idur = idx("duration_sec");
const iqs = idx("qsuite_equipped");
const ist = idx("starlink");
const ial = idx("operating_airline");
const ioo = idx("offer_origin");
const iod = idx("offer_destination");

if (iq < 0 || ifid < 0 || ifn < 0) {
  console.error("CSV missing required columns (query_date, flight_id, flight_number):", abs);
  process.exit(1);
}

const batch = [];
for (let i = 1; i < lines.length; i++) {
  const cols = splitCsvLine(lines[i]);
  if (cols.length < header.length) continue;
  const get = (j) => (j >= 0 ? (cols[j] ?? "").trim() : "");
  const flightId = get(ifid);
  if (!flightId) continue;
  batch.push({
    flightId,
    queryDate: get(iq),
    flightNumber: get(ifn).toUpperCase().replace(/\s/g, ""),
    origin: get(io).toUpperCase(),
    destination: get(id).toUpperCase(),
    departureLocal: get(idep),
    arrivalLocal: get(iarr),
    vehicleCode: get(ivc),
    vehicleName: get(ivn),
    vehicleShort: get(ivs),
    durationSec: idur >= 0 ? parseIntOpt(get(idur)) : null,
    qsuiteEquipped: iqs >= 0 ? parseBool(get(iqs)) : null,
    starlink: ist >= 0 ? parseBool(get(ist)) : null,
    operatingAirline: ial >= 0 ? get(ial) || null : null,
    offerOrigin: ioo >= 0 ? get(ioo).toUpperCase() || null : null,
    offerDestination: iod >= 0 ? get(iod).toUpperCase() || null : null,
  });
}

if (batch.length === 0) {
  console.error("No valid rows parsed from:", abs);
  process.exit(1);
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set (.env.local or .env).");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  await prisma.$transaction(async (tx) => {
    await tx.plannedSegment.deleteMany({});
    const chunk = 250;
    for (let i = 0; i < batch.length; i += chunk) {
      await tx.plannedSegment.createMany({ data: batch.slice(i, i + chunk) });
    }
  });
  console.log(`PlannedSegment: loaded ${batch.length} rows from`, abs);
} finally {
  await prisma.$disconnect();
}

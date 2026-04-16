/**
 * Idempotent: upserts BFF-shaped sample PlannedSegment rows for 2026-04-16 (QR274/284/934) if useful for local dev.
 * Requires DATABASE_URL (same as other db scripts).
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { PrismaClient } = require(join(root, ".prisma-client/index.js"));
loadDbEnv(root);

const samples = [
  {
    flightId: "SEG-QR274-AMSDOH-2026-04-16-1625",
    queryDate: "2026-04-16",
    flightNumber: "QR274",
    origin: "AMS",
    destination: "DOH",
    departureLocal: "2026-04-16T16:25:00",
    arrivalLocal: "2026-04-17T00:30:00",
    vehicleCode: "359",
    vehicleName: "Airbus A350-900",
    vehicleShort: "A359",
    durationSec: 25500,
    qsuiteEquipped: false,
    starlink: true,
    operatingAirline: "Qatar Airways",
    offerOrigin: "AMS",
    offerDestination: "MNL",
  },
  {
    flightId: "SEG-QR284-AMSDOH-2026-04-16-2230",
    queryDate: "2026-04-16",
    flightNumber: "QR284",
    origin: "AMS",
    destination: "DOH",
    departureLocal: "2026-04-16T22:30:00",
    arrivalLocal: "2026-04-17T06:35:00",
    vehicleCode: "359",
    vehicleName: "Airbus A350-900",
    vehicleShort: "A359",
    durationSec: 25500,
    qsuiteEquipped: false,
    starlink: true,
    operatingAirline: "Qatar Airways",
    offerOrigin: "AMS",
    offerDestination: "MNL",
  },
  {
    flightId: "SEG-QR934-DOHMNL-2026-04-17-1830",
    queryDate: "2026-04-16",
    flightNumber: "QR934",
    origin: "DOH",
    destination: "MNL",
    departureLocal: "2026-04-17T18:30:00",
    arrivalLocal: "2026-04-18T08:35:00",
    vehicleCode: "77W",
    vehicleName: "Boeing 777-300ER",
    vehicleShort: "B773",
    durationSec: 32700,
    qsuiteEquipped: true,
    starlink: true,
    operatingAirline: "Qatar Airways",
    offerOrigin: "AMS",
    offerDestination: "MNL",
  },
];

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set (.env.local or .env).");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  for (const row of samples) {
    await prisma.plannedSegment.upsert({
      where: { flightId: row.flightId },
      create: row,
      update: row,
    });
  }
  console.log("Upserted", samples.length, "April 16 sample PlannedSegment rows.");
} finally {
  await prisma.$disconnect();
}

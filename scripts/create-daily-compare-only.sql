-- Safe to run on a shared Postgres: only creates route-check tables (no DROP).
-- Prefer a dedicated database for this app.

CREATE TABLE IF NOT EXISTS "DailyCompare" (
    "id" TEXT NOT NULL,
    "compareDate" DATE NOT NULL,
    "flight" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "plannedEquipment" TEXT,
    "plannedQsuiteApi" BOOLEAN,
    "plannedQueryDate" TEXT,
    "plannedDepartureLocal" TEXT,
    "actualRegistration" TEXT,
    "actualAircraftCell" TEXT,
    "actualEquipment" TEXT,
    "actualQsuiteFromTail" BOOLEAN,
    "matchQsuite" BOOLEAN,
    "matchEquipment" BOOLEAN,
    "fr24Error" TEXT,
    "source" TEXT NOT NULL DEFAULT 'fr24',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCompare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DailyCompare_compareDate_idx" ON "DailyCompare"("compareDate");

CREATE UNIQUE INDEX IF NOT EXISTS "DailyCompare_compareDate_flight_routeKey_key"
  ON "DailyCompare"("compareDate", "flight", "routeKey");

ALTER TABLE "DailyCompare" ADD COLUMN IF NOT EXISTS "actualEquipment" TEXT;
ALTER TABLE "DailyCompare" ADD COLUMN IF NOT EXISTS "matchEquipment" BOOLEAN;

CREATE TABLE IF NOT EXISTS "PlannedSegment" (
    "id" TEXT NOT NULL,
    "flightId" TEXT NOT NULL,
    "queryDate" TEXT NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departureLocal" TEXT NOT NULL,
    "arrivalLocal" TEXT NOT NULL,
    "vehicleCode" TEXT NOT NULL,
    "vehicleName" TEXT NOT NULL,
    "vehicleShort" TEXT NOT NULL,
    "durationSec" INTEGER,
    "qsuiteEquipped" BOOLEAN,
    "starlink" BOOLEAN,
    "operatingAirline" TEXT,
    "offerOrigin" TEXT,
    "offerDestination" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlannedSegment_flightId_key" ON "PlannedSegment"("flightId");

CREATE INDEX IF NOT EXISTS "PlannedSegment_flightNumber_origin_destination_idx"
  ON "PlannedSegment"("flightNumber", "origin", "destination");

CREATE INDEX IF NOT EXISTS "PlannedSegment_queryDate_idx" ON "PlannedSegment"("queryDate");

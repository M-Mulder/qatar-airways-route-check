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
    "actualQsuiteFromTail" BOOLEAN,
    "matchQsuite" BOOLEAN,
    "fr24Error" TEXT,
    "source" TEXT NOT NULL DEFAULT 'fr24',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCompare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DailyCompare_compareDate_idx" ON "DailyCompare"("compareDate");

CREATE UNIQUE INDEX IF NOT EXISTS "DailyCompare_compareDate_flight_routeKey_key"
  ON "DailyCompare"("compareDate", "flight", "routeKey");

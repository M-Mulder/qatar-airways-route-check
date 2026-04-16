-- CreateTable
CREATE TABLE "DailyCompare" (
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

-- CreateIndex
CREATE INDEX "DailyCompare_compareDate_idx" ON "DailyCompare"("compareDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCompare_compareDate_flight_routeKey_key" ON "DailyCompare"("compareDate", "flight", "routeKey");


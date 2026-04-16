-- CreateTable
CREATE TABLE "PlannedSegment" (
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

-- CreateIndex
CREATE UNIQUE INDEX "PlannedSegment_flightId_key" ON "PlannedSegment"("flightId");

-- CreateIndex
CREATE INDEX "PlannedSegment_flightNumber_origin_destination_idx" ON "PlannedSegment"("flightNumber", "origin", "destination");

-- CreateIndex
CREATE INDEX "PlannedSegment_queryDate_idx" ON "PlannedSegment"("queryDate");

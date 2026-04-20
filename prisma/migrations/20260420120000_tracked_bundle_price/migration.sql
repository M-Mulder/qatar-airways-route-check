-- SerpAPI Google Flights daily price rows for tracked AMS→DOH→MNL bundle (QR274 + QR934).
CREATE TABLE IF NOT EXISTS "TrackedBundlePriceSnapshot" (
    "id" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bundleFirstLegDate" DATE NOT NULL,
    "cabin" TEXT NOT NULL,
    "priceTotal" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "matchedBundle" BOOLEAN NOT NULL DEFAULT false,
    "qsuiteIndicatorsPresent" BOOLEAN,
    "flightNumbersSummary" TEXT,
    "error" TEXT,
    "serpSearchId" TEXT,

    CONSTRAINT "TrackedBundlePriceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrackedBundlePriceSnapshot_bundleFirstLegDate_cabin_observedAt_idx"
  ON "TrackedBundlePriceSnapshot"("bundleFirstLegDate", "cabin", "observedAt");

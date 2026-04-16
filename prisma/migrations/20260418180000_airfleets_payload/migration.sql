-- Airfleets.net snapshot (JSON) populated by compare cron when a registration is known.
ALTER TABLE "DailyCompare" ADD COLUMN IF NOT EXISTS "airfleetsPayload" JSONB;

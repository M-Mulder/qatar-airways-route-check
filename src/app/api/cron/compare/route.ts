import { NextResponse } from "next/server";
import { DEFAULT_SEGMENTS, getSegmentsFromEnv } from "@/lib/config";
import { runCompareForDates } from "@/lib/compareJob";
import { runTrackedBundlePriceSnapshots } from "@/lib/trackedBundleJob";
import { amsterdamThreeDayCompareWindowIso } from "@/lib/dates";
import { pickMinCompareDateFromPlannedRows } from "@/lib/plannedCsv";
import { loadPlannedRowsFromDatabase } from "@/lib/plannedFromDb";

export const runtime = "nodejs";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Vercel Cron: GET with Authorization Bearer CRON_SECRET. Schedule is `vercel.json` (once daily on Hobby;
 * e.g. 17:30 UTC). When `SERPAPI_KEY` is set, the same run also records Google Flights bundle prices (`/pricing`).
 * - No `?date=`: compare **yesterday, today, and tomorrow** (Europe/Amsterdam), intersected with dates
 *   **on or after** the earliest planned departure in Postgres for configured segments (avoids empty runs
 *   before your export starts). Live comparison data is fetched once per flight for the whole batch.
 * - `?date=YYYY-MM-DD`: single-day run (manual backfill).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 401 });

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return unauthorized();

  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not set" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const segments = getSegmentsFromEnv();
  const segs = segments.length ? segments : DEFAULT_SEGMENTS;

  try {
    const cronStarted = Date.now();
    console.log("[cron] compare GET: loading planned rows");
    const plannedRows = await loadPlannedRowsFromDatabase();
    if (plannedRows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No planned segments in database. Run: npm run db:seed-planned <path-to-qatar_segments_export.csv>",
        },
        { status: 500 },
      );
    }

    let compareDateIsos: string[];
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      compareDateIsos = [dateParam];
    } else {
      const [y, t, tm] = amsterdamThreeDayCompareWindowIso();
      const csvMin = pickMinCompareDateFromPlannedRows(plannedRows, segs);
      const windowDates = [y, t, tm];
      compareDateIsos = csvMin ? windowDates.filter((d) => d >= csvMin) : windowDates;
      if (compareDateIsos.length === 0) compareDateIsos = windowDates;
    }

    console.log("[cron] compare: running FR24/compare job", { dates: compareDateIsos, segments: segs });
    const result = await runCompareForDates(compareDateIsos, segs, plannedRows);
    console.log("[cron] compare: compare job finished ms=", Date.now() - cronStarted, {
      compareDates: result.compareDates,
      segmentsProcessed: result.segmentsProcessed,
      errorsCount: result.errors?.length ?? 0,
    });

    let trackedBundlePricing: Awaited<ReturnType<typeof runTrackedBundlePriceSnapshots>> | null = null;
    const pricingStarted = Date.now();
    console.log("[cron] starting Google Flights /pricing snapshot (SERPAPI_KEY set:", Boolean(process.env.SERPAPI_KEY?.trim()), ")");
    try {
      trackedBundlePricing = await runTrackedBundlePriceSnapshots();
      console.log("[cron] pricing snapshot finished ms=", Date.now() - pricingStarted);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[pricing] runTrackedBundlePriceSnapshots threw:", message);
      trackedBundlePricing = {
        skipped: true,
        reason: message,
        results: [],
      };
    }

    if (trackedBundlePricing) {
      const { skipped, reason, results } = trackedBundlePricing;
      console.log("[pricing] cron summary", {
        skipped,
        reason: skipped ? reason : undefined,
        cabins: results?.length,
        anyDbError: results?.some((r) => r.dbPersisted === false),
      });
    }

    return NextResponse.json({ ok: true, ...result, trackedBundlePricing });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

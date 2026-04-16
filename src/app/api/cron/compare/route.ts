import { NextResponse } from "next/server";
import { DEFAULT_SEGMENTS, getSegmentsFromEnv } from "@/lib/config";
import { runCompareForDates } from "@/lib/compareJob";
import { amsterdamThreeDayCompareWindowIso } from "@/lib/dates";
import { pickMinCompareDateFromPlannedRows } from "@/lib/plannedCsv";
import { loadPlannedRowsFromDatabase } from "@/lib/plannedFromDb";

export const runtime = "nodejs";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Secured compare job: GET with Authorization Bearer CRON_SECRET. Run on a schedule via your host of choice,
 * or locally: `npm run dev` then `npm run cron:local` (see README).
 * - No `?date=`: compare **yesterday, today, and tomorrow** (Europe/Amsterdam), intersected with dates
 *   **on or after** the earliest planned departure in Postgres for configured segments (avoids empty runs
 *   before your export starts). FR24 is fetched once per flight for the whole batch.
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

    const result = await runCompareForDates(compareDateIsos, segs, plannedRows);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

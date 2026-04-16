import { NextResponse } from "next/server";
import { DEFAULT_SEGMENTS, getSegmentsFromEnv } from "@/lib/config";
import { runCompareForDate } from "@/lib/compareJob";
import { amsterdamYesterdayIso } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Vercel Cron: GET with Authorization Bearer CRON_SECRET.
 * Optional query: ?date=YYYY-MM-DD (Amsterdam calendar day to compare; default yesterday AMS).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return unauthorized();

  const url = process.env.PLANNED_DATA_URL;
  if (!url?.trim()) {
    return NextResponse.json({ ok: false, error: "PLANNED_DATA_URL not set" }, { status: 500 });
  }

  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not set" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const compareDateIso = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : amsterdamYesterdayIso();

  const segments = getSegmentsFromEnv();
  const segs = segments.length ? segments : DEFAULT_SEGMENTS;

  try {
    const result = await runCompareForDate(compareDateIso, segs, url);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

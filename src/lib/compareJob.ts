import { getPrisma } from "@/lib/prisma";
import type { SegmentDef } from "@/lib/config";
import { fetchFr24FlightHistoryHtml, findFr24RowForDay, parseFr24FlightHistoryHtml } from "@/lib/fr24FlightHistory";
import {
  departureDateKey,
  fetchPlannedCsv,
  parsePlannedCsv,
  pickPlannedForSegment,
  plannedEquipmentSummary,
} from "@/lib/plannedCsv";
import { hasQsuiteTail } from "@/lib/qsuiteRegistry";

function compareDateToPrisma(compareDateIso: string): Date {
  return new Date(`${compareDateIso}T12:00:00.000Z`);
}

function matchQsuite(
  planned: boolean | null | undefined,
  actual: boolean | null | undefined,
): boolean | null {
  if (planned === null || planned === undefined) return null;
  if (actual === null || actual === undefined) return null;
  return planned === actual;
}

export type CompareJobResult = {
  compareDate: string;
  segmentsProcessed: number;
  errors: string[];
};

/**
 * Load planned CSV, scrape FR24 per distinct flight, upsert DailyCompare rows for each segment.
 */
export async function runCompareForDate(
  compareDateIso: string,
  segments: SegmentDef[],
  plannedUrl: string,
): Promise<CompareJobResult> {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error("DATABASE_URL is not set");
  }
  const errors: string[] = [];
  const plannedText = await fetchPlannedCsv(plannedUrl);
  const plannedRows = parsePlannedCsv(plannedText);

  const fr24Cache = new Map<string, ReturnType<typeof parseFr24FlightHistoryHtml>>();
  const flightsNeeded = [...new Set(segments.map((s) => s.flight))];

  for (const flight of flightsNeeded) {
    try {
      const html = await fetchFr24FlightHistoryHtml(flight);
      fr24Cache.set(flight, parseFr24FlightHistoryHtml(html));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${flight} FR24: ${msg}`);
      fr24Cache.set(flight, []);
    }
  }

  let segmentsProcessed = 0;
  const compareDate = compareDateToPrisma(compareDateIso);

  for (const seg of segments) {
    const planned = pickPlannedForSegment(
      plannedRows,
      compareDateIso,
      seg.flight,
      seg.fromIata,
      seg.toIata,
    );

    const fr24Rows = fr24Cache.get(seg.flight) ?? [];
    const fr = findFr24RowForDay(fr24Rows, compareDateIso, seg.fromIata, seg.toIata);

    const plannedEquipment = planned ? plannedEquipmentSummary(planned) : null;
    const plannedQsuiteApi = planned?.qsuite_equipped ?? null;
    const plannedQueryDate = planned?.query_date ?? null;
    const plannedDepartureLocal = planned?.departure_local ?? null;

    const actualRegistration = fr?.registration ?? null;
    const actualAircraftCell = fr?.aircraftCellText ?? null;
    const actualQsuiteFromTail = actualRegistration ? hasQsuiteTail(actualRegistration) : null;

    let fr24Error: string | null = null;
    if (!fr) {
      const fetchFail = errors.find((e) => e.startsWith(`${seg.flight} FR24`));
      if (fetchFail) fr24Error = fetchFail;
      else if (fr24Rows.length === 0) fr24Error = "No FR24 rows parsed";
      else fr24Error = "No matching FR24 row for this date/route";
    }

    const mq = matchQsuite(plannedQsuiteApi, actualQsuiteFromTail);

    await prisma.dailyCompare.upsert({
      where: {
        compareDate_flight_routeKey: {
          compareDate,
          flight: seg.flight,
          routeKey: seg.routeKey,
        },
      },
      create: {
        compareDate,
        flight: seg.flight,
        routeKey: seg.routeKey,
        plannedEquipment,
        plannedQsuiteApi,
        plannedQueryDate,
        plannedDepartureLocal,
        actualRegistration,
        actualAircraftCell,
        actualQsuiteFromTail,
        matchQsuite: mq,
        fr24Error,
        source: "fr24",
      },
      update: {
        plannedEquipment,
        plannedQsuiteApi,
        plannedQueryDate,
        plannedDepartureLocal,
        actualRegistration,
        actualAircraftCell,
        actualQsuiteFromTail,
        matchQsuite: mq,
        fr24Error,
      },
    });
    segmentsProcessed += 1;
  }

  return { compareDate: compareDateIso, segmentsProcessed, errors };
}

/** Dev helper: validate planned rows have departure keys. */
export function debugCountPlannedForDate(plannedRows: ReturnType<typeof parsePlannedCsv>, iso: string): number {
  return plannedRows.filter((r) => departureDateKey(r.departure_local) === iso).length;
}

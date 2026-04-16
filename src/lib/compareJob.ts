import { Prisma } from "@/generated/prisma";
import { fetchAirfleetsForRegistration, type AirfleetsPayload } from "@/lib/airfleets";
import { getPrisma } from "@/lib/prisma";
import type { SegmentDef } from "@/lib/config";
import { fetchFr24FlightHistoryHtml, findFr24RowForDay, parseFr24FlightHistoryHtml } from "@/lib/fr24FlightHistory";
import type { PlannedRow } from "@/lib/plannedCsv";
import { fr24EquipmentSummary, matchPlannedVsFr24Equipment } from "@/lib/equipmentCompare";
import { departureDateKey, pickPlannedForSegment, plannedEquipmentSummary } from "@/lib/plannedCsv";
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

export type MultiCompareJobResult = {
  compareDates: string[];
  segmentsProcessed: number;
  errors: string[];
};

/**
 * Load planned rows once, fetch live comparison HTML once per distinct flight.
 * Upserts DailyCompare only when Qsuite and equipment family compares are both decisive (Match/Mismatch each).
 * Deletes any existing row when either dimension is inconclusive (N/A).
 */
export async function runCompareForDates(
  compareDateIsos: string[],
  segments: SegmentDef[],
  plannedRows: PlannedRow[],
): Promise<MultiCompareJobResult> {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error("DATABASE_URL is not set");
  }
  const errors: string[] = [];

  const fr24Cache = new Map<string, ReturnType<typeof parseFr24FlightHistoryHtml>>();
  const airfleetsCache = new Map<string, AirfleetsPayload>();
  const flightsNeeded = [...new Set(segments.map((s) => s.flight))];

  async function airfleetsForRegistration(reg: string | null): Promise<Prisma.InputJsonValue | null> {
    if (!reg?.trim()) return null;
    const key = reg.toUpperCase().trim();
    let hit = airfleetsCache.get(key);
    if (!hit) {
      // Visible in Vercel function logs (aircraft payload only runs for rows that pass Qsuite+equipment gates).
      console.info(`[compare] Aircraft payload fetch start registration=${key}`);
      hit = await fetchAirfleetsForRegistration(key);
      airfleetsCache.set(key, hit);
      const err = typeof hit.error === "string" ? hit.error : "";
      console.info(
        `[compare] Aircraft payload fetch done registration=${key} ok=${!err} ${err ? `error=${err.slice(0, 400)}` : ""}`,
      );
    }
    return hit as unknown as Prisma.InputJsonValue;
  }

  for (const flight of flightsNeeded) {
    try {
      const html = await fetchFr24FlightHistoryHtml(flight);
      fr24Cache.set(flight, parseFr24FlightHistoryHtml(html));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${flight}: ${msg}`);
      fr24Cache.set(flight, []);
    }
  }

  const uniqueDates = [...new Set(compareDateIsos)].sort();
  let segmentsProcessed = 0;

  try {
  for (const compareDateIso of uniqueDates) {
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
      const actualEquipment = fr24EquipmentSummary(actualAircraftCell);
      const eqMatch = matchPlannedVsFr24Equipment(plannedEquipment, actualAircraftCell);

      let fr24Error: string | null = null;
      if (!fr) {
        const fetchFail = errors.find((e) => e.startsWith(`${seg.flight}: `));
        if (fetchFail) fr24Error = fetchFail;
        else if (fr24Rows.length === 0) fr24Error = "Could not read any flights for this flight from the comparison source.";
        else fr24Error = "No flight listed for this date and route in the available data.";
      }

      const mq = matchQsuite(plannedQsuiteApi, actualQsuiteFromTail);

      if (mq === null || eqMatch === null) {
        await prisma.dailyCompare.deleteMany({
          where: {
            compareDate,
            flight: seg.flight,
            routeKey: seg.routeKey,
          },
        });
        continue;
      }

      const airfleetsPayload = await airfleetsForRegistration(actualRegistration);

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
          actualEquipment,
          actualQsuiteFromTail,
          matchQsuite: mq,
          matchEquipment: eqMatch,
          fr24Error,
          ...(airfleetsPayload != null ? { airfleetsPayload } : {}),
          source: "fr24",
        },
        update: {
          plannedEquipment,
          plannedQsuiteApi,
          plannedQueryDate,
          plannedDepartureLocal,
          actualRegistration,
          actualAircraftCell,
          actualEquipment,
          actualQsuiteFromTail,
          matchQsuite: mq,
          matchEquipment: eqMatch,
          fr24Error,
          airfleetsPayload: airfleetsPayload ?? Prisma.DbNull,
        },
      });
      segmentsProcessed += 1;
    }
  }

  return { compareDates: uniqueDates, segmentsProcessed, errors };
  } finally {
    try {
      const { closeAirfleetsPlaywright } = await import("@/lib/airfleetsPlaywright");
      await closeAirfleetsPlaywright();
    } catch {
      /* noop — Playwright optional / not loaded */
    }
  }
}

/** Single calendar day (back-compat). */
export async function runCompareForDate(
  compareDateIso: string,
  segments: SegmentDef[],
  plannedRows: PlannedRow[],
): Promise<CompareJobResult> {
  const r = await runCompareForDates([compareDateIso], segments, plannedRows);
  return { compareDate: compareDateIso, segmentsProcessed: r.segmentsProcessed, errors: r.errors };
}

/** Dev helper: validate planned rows have departure keys. */
export function debugCountPlannedForDate(plannedRows: PlannedRow[], iso: string): number {
  return plannedRows.filter((r) => departureDateKey(r.departure_local) === iso).length;
}

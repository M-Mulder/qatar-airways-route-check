import type { DailyCompare } from "@/generated/prisma";
import type { PlannedRow } from "@/lib/plannedCsv";
import { departureDateKey } from "@/lib/plannedCsv";

export type PlannedExportSummary = {
  rowCount: number;
  minDepartureDay: string | null;
  maxDepartureDay: string | null;
  flights: Record<string, number>;
  qsuiteYes: number;
  qsuiteNo: number;
  qsuiteUnknown: number;
};

export function summarizePlannedExport(rows: PlannedRow[]): PlannedExportSummary {
  const dayKeys: string[] = [];
  const flights: Record<string, number> = {};
  let qsuiteYes = 0;
  let qsuiteNo = 0;
  let qsuiteUnknown = 0;

  for (const r of rows) {
    const d = departureDateKey(r.departure_local);
    if (d) dayKeys.push(d);
    const fn = r.flight_number || "—";
    flights[fn] = (flights[fn] ?? 0) + 1;
    if (r.qsuite_equipped === true) qsuiteYes += 1;
    else if (r.qsuite_equipped === false) qsuiteNo += 1;
    else qsuiteUnknown += 1;
  }

  const sortedDays = [...dayKeys].sort();
  const minDepartureDay = sortedDays.length ? sortedDays[0]! : null;
  const maxDepartureDay = sortedDays.length ? sortedDays.at(-1)! : null;

  return {
    rowCount: rows.length,
    minDepartureDay,
    maxDepartureDay,
    flights,
    qsuiteYes,
    qsuiteNo,
    qsuiteUnknown,
  };
}

export type DbCompareRollup = {
  dates: string[];
  matchYes: number;
  matchNo: number;
  matchNa: number;
};

export function summarizeDbCompares(rows: DailyCompare[]): DbCompareRollup {
  const dates = [...new Set(rows.map((r) => r.compareDate.toISOString().slice(0, 10)))].sort().reverse();
  let matchYes = 0;
  let matchNo = 0;
  let matchNa = 0;
  for (const r of rows) {
    if (r.matchQsuite === true) matchYes += 1;
    else if (r.matchQsuite === false) matchNo += 1;
    else matchNa += 1;
  }
  return { dates, matchYes, matchNo, matchNa };
}

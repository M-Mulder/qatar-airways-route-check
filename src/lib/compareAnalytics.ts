import type { DailyCompare } from "@/generated/prisma";
import { overallCompareMatch, type CompareExplainInput } from "@/lib/compareExplain";

export type CompareAnalytics = {
  total: number;
  overallAligned: number;
  overallNotAligned: number;
  overallUnclear: number;
  qsuiteMatch: number;
  qsuiteMismatch: number;
  qsuiteUnknown: number;
  equipmentMatch: number;
  equipmentMismatch: number;
  equipmentUnknown: number;
  /** Rows where the operated tail is in the Qsuite registry. */
  tailQsuiteYes: number;
  tailQsuiteNo: number;
  tailQsuiteUnknown: number;
  /** Airline / schedule API marked Qsuite for the segment. */
  scheduleQsuiteYes: number;
  scheduleQsuiteNo: number;
  scheduleQsuiteUnknown: number;
  /** Per departure date: how many checks were fully aligned vs total that day. */
  byDate: Array<{ date: string; aligned: number; total: number }>;
};

function rowToExplainInput(r: DailyCompare): CompareExplainInput {
  return {
    plannedEquipment: r.plannedEquipment,
    actualEquipment: r.actualEquipment,
    plannedQsuiteApi: r.plannedQsuiteApi,
    actualQsuiteFromTail: r.actualQsuiteFromTail,
    actualAircraftCell: r.actualAircraftCell,
    matchQsuite: r.matchQsuite,
    matchEquipment: r.matchEquipment,
    actualRegistration: r.actualRegistration,
  };
}

export function buildCompareAnalytics(rows: DailyCompare[]): CompareAnalytics {
  const out: CompareAnalytics = {
    total: 0,
    overallAligned: 0,
    overallNotAligned: 0,
    overallUnclear: 0,
    qsuiteMatch: 0,
    qsuiteMismatch: 0,
    qsuiteUnknown: 0,
    equipmentMatch: 0,
    equipmentMismatch: 0,
    equipmentUnknown: 0,
    tailQsuiteYes: 0,
    tailQsuiteNo: 0,
    tailQsuiteUnknown: 0,
    scheduleQsuiteYes: 0,
    scheduleQsuiteNo: 0,
    scheduleQsuiteUnknown: 0,
    byDate: [],
  };

  const dateMap = new Map<string, { aligned: number; total: number }>();

  for (const r of rows) {
    out.total += 1;
    const input = rowToExplainInput(r);
    const overall = overallCompareMatch(input);
    if (overall === true) out.overallAligned += 1;
    else if (overall === false) out.overallNotAligned += 1;
    else out.overallUnclear += 1;

    if (r.matchQsuite === true) out.qsuiteMatch += 1;
    else if (r.matchQsuite === false) out.qsuiteMismatch += 1;
    else out.qsuiteUnknown += 1;

    if (r.matchEquipment === true) out.equipmentMatch += 1;
    else if (r.matchEquipment === false) out.equipmentMismatch += 1;
    else out.equipmentUnknown += 1;

    if (r.actualQsuiteFromTail === true) out.tailQsuiteYes += 1;
    else if (r.actualQsuiteFromTail === false) out.tailQsuiteNo += 1;
    else out.tailQsuiteUnknown += 1;

    if (r.plannedQsuiteApi === true) out.scheduleQsuiteYes += 1;
    else if (r.plannedQsuiteApi === false) out.scheduleQsuiteNo += 1;
    else out.scheduleQsuiteUnknown += 1;

    const d = r.compareDate.toISOString().slice(0, 10);
    const bucket = dateMap.get(d) ?? { aligned: 0, total: 0 };
    bucket.total += 1;
    if (overall === true) bucket.aligned += 1;
    dateMap.set(d, bucket);
  }

  out.byDate = [...dateMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return out;
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((100 * part) / total);
}

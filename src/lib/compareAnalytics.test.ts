import { describe, expect, it } from "vitest";
import type { DailyCompare } from "@/generated/prisma";
import { buildCompareAnalytics, buildRouteQsuiteBars, pct } from "./compareAnalytics";

function row(partial: Partial<DailyCompare> & Pick<DailyCompare, "compareDate">): DailyCompare {
  return {
    id: "x",
    flight: "QR274",
    routeKey: "AMS-DOH",
    plannedEquipment: "A350-900",
    plannedQsuiteApi: false,
    plannedQueryDate: null,
    plannedDepartureLocal: null,
    actualRegistration: "A7-ALK",
    actualAircraftCell: "A359",
    actualEquipment: "A350-900",
    actualQsuiteFromTail: false,
    matchQsuite: true,
    matchEquipment: true,
    fr24Error: null,
    airfleetsPayload: null,
    source: "fr24",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as DailyCompare;
}

describe("buildCompareAnalytics", () => {
  it("aggregates alignment and tail Qsuite counts", () => {
    const d = new Date("2026-04-10T12:00:00.000Z");
    const rows = [
      row({ compareDate: d, matchQsuite: true, matchEquipment: true, actualQsuiteFromTail: true }),
      row({
        compareDate: d,
        matchQsuite: false,
        matchEquipment: true,
        actualQsuiteFromTail: false,
        id: "y",
      }),
    ];
    const a = buildCompareAnalytics(rows);
    expect(a.total).toBe(2);
    expect(a.overallAligned).toBe(1);
    expect(a.overallNotAligned).toBe(1);
    expect(a.qsuiteMatch).toBe(1);
    expect(a.qsuiteMismatch).toBe(1);
    expect(a.tailQsuiteYes).toBe(1);
    expect(a.tailQsuiteNo).toBe(1);
    expect(a.byDate).toHaveLength(1);
    expect(a.byDate[0]!.aligned).toBe(1);
    expect(a.byDate[0]!.total).toBe(2);
  });
});

describe("pct", () => {
  it("rounds percentages", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBe(0);
  });
});

describe("buildRouteQsuiteBars", () => {
  it("groups tail Qsuite verdicts by route and sorts by volume", () => {
    const d = new Date("2026-04-10T12:00:00.000Z");
    const rows = [
      row({ compareDate: d, routeKey: "AMS-DOH", actualQsuiteFromTail: true }),
      row({ compareDate: d, routeKey: "AMS-DOH", actualQsuiteFromTail: false, id: "b" }),
      row({ compareDate: d, routeKey: "DOH-SIN", actualQsuiteFromTail: true, id: "c" }),
    ];
    const bars = buildRouteQsuiteBars(rows);
    expect(bars).toHaveLength(2);
    expect(bars[0]!.routeKey).toBe("AMS-DOH");
    expect(bars[0]!.total).toBe(2);
    expect(bars[0]!.tailQsuiteYes).toBe(1);
    expect(bars[0]!.tailQsuiteNo).toBe(1);
    expect(bars[0]!.tailQsuiteUnknown).toBe(0);
    expect(bars[1]!.routeKey).toBe("DOH-SIN");
    expect(bars[1]!.total).toBe(1);
  });
});

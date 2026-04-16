import { describe, expect, it } from "vitest";
import { buildCompareBriefing, compareHoverExplanation, overallCompareMatch } from "./compareExplain";
import { equipmentCategory, matchPlannedVsFr24Equipment } from "./equipmentCompare";

describe("equipmentCategory", () => {
  it("maps planned-style labels and live equipment snippets", () => {
    expect(equipmentCategory("A350-900")).toBe("A350-900");
    expect(equipmentCategory("A359")).toBe("A350-900");
    expect(equipmentCategory("359")).toBe("A350-900");
    expect(equipmentCategory("Airbus A350-941")).toBe("A350-900");
    expect(equipmentCategory("B77W")).toBe("B77W");
    expect(equipmentCategory("Boeing 777-300ER")).toBe("B77W");
    expect(equipmentCategory("A350-1000")).toBe("A350-1000");
  });
});

describe("matchPlannedVsFr24Equipment", () => {
  it("returns true when families match", () => {
    expect(matchPlannedVsFr24Equipment("A350-900", "A359")).toBe(true);
  });
  it("returns false when families differ", () => {
    expect(matchPlannedVsFr24Equipment("A350-900", "B773")).toBe(false);
  });
});

describe("overallCompareMatch", () => {
  it("requires both when equipment match is stored", () => {
    expect(
      overallCompareMatch({
        plannedEquipment: "A350-900",
        actualEquipment: "A350-900",
        plannedQsuiteApi: true,
        actualQsuiteFromTail: true,
        actualAircraftCell: "A359",
        matchQsuite: true,
        matchEquipment: true,
        actualRegistration: "A7-X",
      }),
    ).toBe(true);
    expect(
      overallCompareMatch({
        plannedEquipment: "A350-900",
        actualEquipment: "B77W",
        plannedQsuiteApi: true,
        actualQsuiteFromTail: true,
        actualAircraftCell: "B773",
        matchQsuite: true,
        matchEquipment: false,
        actualRegistration: "A7-X",
      }),
    ).toBe(false);
  });

  it("falls back to Qsuite-only for legacy rows", () => {
    expect(
      overallCompareMatch({
        plannedEquipment: "A350-900",
        actualEquipment: null,
        plannedQsuiteApi: false,
        actualQsuiteFromTail: false,
        actualAircraftCell: "A359",
        matchQsuite: true,
        matchEquipment: null,
        actualRegistration: "A7-X",
      }),
    ).toBe(true);
  });
});

describe("compareHoverExplanation", () => {
  it("explains Qsuite match and equipment match", () => {
    const t = compareHoverExplanation({
      plannedEquipment: "A350-900",
      actualEquipment: "A350-900",
      plannedQsuiteApi: false,
      actualQsuiteFromTail: false,
      actualAircraftCell: "A359",
      matchQsuite: true,
      matchEquipment: true,
      actualRegistration: "A7-ALK",
    });
    expect(t).toContain("Qsuite aligned");
    expect(t).toContain("Not marked as Qsuite");
    expect(t).toContain("A7-ALK");
    expect(t).toContain("Same family as schedule");
    expect(t).toContain("Schedule vs operated: aligned");
    expect(t).not.toContain("Status shows Aligned");
  });

  it("explains Qsuite mismatch and can still note equipment", () => {
    const t = compareHoverExplanation({
      plannedEquipment: "A350-900",
      actualEquipment: "A350-900",
      plannedQsuiteApi: true,
      actualQsuiteFromTail: false,
      actualAircraftCell: "A359",
      matchQsuite: false,
      matchEquipment: true,
      actualRegistration: "A7-XYZ",
    });
    expect(t).toContain("Qsuite not aligned");
    expect(t).toContain("Marked as Qsuite");
    expect(t).toContain("Not in Qsuite tail list");
    expect(t).toContain("Same family as schedule");
  });

  it("flags equipment family mismatch when Qsuite matches", () => {
    const t = compareHoverExplanation({
      plannedEquipment: "A350-900",
      actualEquipment: "B77W",
      plannedQsuiteApi: false,
      actualQsuiteFromTail: false,
      actualAircraftCell: "B773",
      matchQsuite: true,
      matchEquipment: false,
      actualRegistration: "A7-TEST",
    });
    expect(t).toContain("Qsuite aligned");
    expect(t).toContain("Differs from schedule");
    expect(t).toContain("B77W");
  });
});

describe("buildCompareBriefing", () => {
  it("returns structured qsuite and equipment", () => {
    const b = buildCompareBriefing({
      plannedEquipment: "A350-900",
      actualEquipment: "A350-900",
      plannedQsuiteApi: false,
      actualQsuiteFromTail: false,
      actualAircraftCell: "A359",
      matchQsuite: true,
      matchEquipment: true,
      actualRegistration: "A7-ALK",
    });
    expect(b.qsuite.kind).toBe("match");
    expect(b.primaryTitle).toBe("Schedule vs operated: aligned");
    expect(b.qsuite.scheduleQsuiteText).toBe("Not marked as Qsuite");
    expect(b.qsuite.tailQsuiteText).toBe("Not in Qsuite tail list");
    expect(b.equipment.aligned).toBe(true);
    expect(b.footnote).toBe("");
    expect(b.titleStyle).toBe("technical");
  });

  it("uses display title style for legacy rows without stored equipment match", () => {
    const b = buildCompareBriefing({
      plannedEquipment: "A350-900",
      actualEquipment: null,
      plannedQsuiteApi: false,
      actualQsuiteFromTail: false,
      actualAircraftCell: "A359",
      matchQsuite: true,
      matchEquipment: null,
      actualRegistration: "A7-ALK",
    });
    expect(b.titleStyle).toBe("display");
    expect(b.footnote.length).toBeGreaterThan(10);
  });
});

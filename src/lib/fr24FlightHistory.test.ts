import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findFr24RowForDay, parseFr24FlightHistoryHtml } from "./fr24FlightHistory";

const fixturePath = join(process.cwd(), "test/fixtures/fr24-qr274-sample.html");

describe("parseFr24FlightHistoryHtml", () => {
  it("parses registration and airports from fixture", () => {
    const html = readFileSync(fixturePath, "utf8");
    const rows = parseFr24FlightHistoryHtml(html);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = findFr24RowForDay(rows, "2026-04-15", "AMS", "DOH");
    expect(row).not.toBeNull();
    expect(row!.registration).toBe("A7-AMG");
    expect(row!.aircraftCellText).toMatch(/A359|359/i);
  });

  it("parses plain-text aircraft cell when there is no /data/aircraft/ link", () => {
    const html = readFileSync(fixturePath, "utf8");
    const rows = parseFr24FlightHistoryHtml(html);
    const row = findFr24RowForDay(rows, "2026-04-14", "AMS", "DOH");
    expect(row).not.toBeNull();
    expect(row!.registration).toBeNull();
    expect(row!.aircraftCellText).toBe("359");
  });
});

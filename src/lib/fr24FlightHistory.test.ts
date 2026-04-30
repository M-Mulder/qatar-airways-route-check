import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findFr24RowForDay,
  parseFr24FlightHistoryHtml,
  parseFr24FlightHistoryPlainText,
  parseFr24FlightHistoryFlexible,
} from "./fr24FlightHistory";

const fixturePath = join(process.cwd(), "test/fixtures/fr24-qr274-sample.html");

describe("parseFr24FlightHistoryHtml", () => {
  it("parses rows when Serper strips td.hidden-xs.hidden-sm classes", () => {
    const html = readFileSync(fixturePath, "utf8").replace(/class="hidden-xs hidden-sm"/g, "");
    const rows = parseFr24FlightHistoryHtml(html);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = findFr24RowForDay(rows, "2026-04-15", "AMS", "DOH");
    expect(row).not.toBeNull();
    expect(row!.registration).toBe("A7-AMG");
  });

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

describe("parseFr24FlightHistoryPlainText (Serper-style text)", () => {
  it("parses a single-line history row with A7 registration", () => {
    const text = `Some header noise
29 Apr 2026 AMS DOH A7-ANB Airbus A350-900
30 Apr 2026 AMS DOH A7-AMG B77W
`;
    const rows = parseFr24FlightHistoryPlainText(text);
    const row = findFr24RowForDay(rows, "2026-04-29", "AMS", "DOH");
    expect(row).not.toBeNull();
    expect(row!.registration).toBe("A7-ANB");
    expect(row!.aircraftCellText).toMatch(/A350-900|Airbus/i);
  });

  it("parseFr24FlightHistoryFlexible falls back to plain text when no HTML table", () => {
    const text = "15 Mar 2026  AMS  DOH  A7-ALL  A359\n";
    const rows = parseFr24FlightHistoryFlexible(text);
    const row = findFr24RowForDay(rows, "2026-03-15", "AMS", "DOH");
    expect(row).not.toBeNull();
    expect(row!.registration).toBe("A7-ALL");
  });
});

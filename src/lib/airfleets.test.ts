import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAirfleetsPlanePage, parseAirfleetsSearchForDetailUrl } from "./airfleets";

const root = join(process.cwd(), "test/fixtures");

describe("parseAirfleetsSearchForDetailUrl", () => {
  it("finds plane detail URL from search HTML", () => {
    const html = readFileSync(join(root, "airfleets-search-a7-alk.html"), "utf8");
    const searchUrl = "https://www.airfleets.net/recherche/?key=A7-ALK";
    const url = parseAirfleetsSearchForDetailUrl(html, "A7-ALK", searchUrl);
    expect(url).toBe("https://www.airfleets.net/ficheapp/plane-a350-33.htm");
  });
});

describe("parseAirfleetsPlanePage", () => {
  it("parses MSN, type, seats (C/Y), hex, engines", () => {
    const html = readFileSync(join(root, "airfleets-plane-a350-33.html"), "utf8");
    const detailUrl = "https://www.airfleets.net/ficheapp/plane-a350-33.htm";
    const p = parseAirfleetsPlanePage(html, detailUrl);
    expect(p.msn).toBe("33");
    expect(p.type).toBe("350-941");
    expect(p.firstFlightDate).toBe("30/05/2016");
    expect(p.testRegistration).toBe("F-WZGB");
    expect(p.planeAge).toContain("9.9");
    expect(p.businessSeats).toBe(36);
    expect(p.economySeats).toBe(247);
    expect(p.hexCode).toBe("06A0FF");
    expect(p.engines).toContain("Trent");
    expect(p.aircraftFamily).toMatch(/A350/i);
  });
});

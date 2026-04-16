import { describe, expect, it } from "vitest";
import {
  parseAirfleetsPlanePlainText,
  parseAirfleetsSearchSerperText,
  planeSlugFromAircraft,
} from "./airfleetsSerper";

const SEARCH_SAMPLE = `Site Search 'A7-ALK'

Search results for : A7-ALK

Plane (registration and MSN)

Aircraft      Regist.   MSN   Airline         Status
Airbus A350   A7-ALK    33    Qatar Airways   Active

Airline

Airline      Country   Status
Your search did not return any result`;

const PLANE_SAMPLE = `Qatar Airways A7-ALK (Airbus A350 - MSN 33)

Airfleets - Do Not Process My Personal Information

If you wish to opt-out of the sale, sharing to third parties, or processing of your personal or sensitive information for targeted advertising by us, please use the below opt-out section to confirm your selection.

Airbus A350 - MSN 33    A7-ALK


Serial number        33
Type                 350-941
First flight date    30/05/2016
Test registration    F-WZGB
Plane age            9.9 years
Seat configuration   C36 Y247
Hex code             06A0FF
Engines              2 x RR Trent XWB-84
Status               Active`;

describe("parseAirfleetsSearchSerperText", () => {
  it("parses the Plane table row from Serper scrape text", () => {
    const row = parseAirfleetsSearchSerperText(SEARCH_SAMPLE, "A7-ALK");
    expect(row).toEqual({
      aircraftFamily: "Airbus A350",
      msn: "33",
      airline: "Qatar Airways",
      lineStatus: "Active",
    });
  });
});

describe("planeSlugFromAircraft", () => {
  it("maps Airbus and Boeing families to ficheapp slug segments", () => {
    expect(planeSlugFromAircraft("Airbus A350")).toBe("a350");
    expect(planeSlugFromAircraft("Airbus A330-900")).toBe("a330-900");
    expect(planeSlugFromAircraft("Boeing 777")).toBe("b777");
    expect(planeSlugFromAircraft("Boeing 777-300ER")).toBe("b777");
    expect(planeSlugFromAircraft("Boeing 787-9")).toBe("b787");
  });
});

describe("parseAirfleetsPlanePlainText", () => {
  it("parses key/value lines from Serper plane page text", () => {
    const url = "https://www.airfleets.net/ficheapp/plane-a350-33.htm";
    const p = parseAirfleetsPlanePlainText(PLANE_SAMPLE, url);
    expect(p.detailUrl).toBe(url);
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

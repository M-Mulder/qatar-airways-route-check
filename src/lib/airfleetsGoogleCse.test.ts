import { describe, expect, it } from "vitest";
import { googleCsePayloadLooksUsable, parseAirfleetsGoogleCseHit } from "./airfleetsGoogleCse";

describe("parseAirfleetsGoogleCseHit", () => {
  it("parses a typical indexed snippet for A7-ALK", () => {
    const title = "MSN 33 A7-ALK - Qatar Airways";
    const snippet =
      "Aircraft : Airbus A350 MSN : 33 Registration title : A7-ALK Serial Number : 33 Type : 350-941 First flight date : 30/05/2016 Test registration : F-WZGB Seat config title C36 Y247";
    const link = "https://www.airfleets.net/ficheapp/plane-a350-33.htm";
    const p = parseAirfleetsGoogleCseHit(title, snippet, link, "A7-ALK");
    expect(googleCsePayloadLooksUsable(p)).toBe(true);
    expect(p.detailUrl).toContain("plane-a350-33");
    expect(p.msn).toBe("33");
    expect(p.type).toContain("350-941");
    expect(p.aircraftFamily).toContain("Airbus A350");
    expect(p.firstFlightDate).toContain("30/05/2016");
    expect(p.testRegistration).toBe("F-WZGB");
    expect(p.businessSeats).toBe(36);
    expect(p.economySeats).toBe(247);
    expect(p.airline).toBe("Qatar Airways");
  });
});

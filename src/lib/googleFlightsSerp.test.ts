import { describe, expect, it } from "vitest";
import { findMatchingBundle, hasQsuiteSuiteMarkersInText } from "@/lib/googleFlightsSerp";

describe("findMatchingBundle", () => {
  it("finds QR274 then QR934 in a two-leg bundle", () => {
    const res = {
      best_flights: [
        {
          price: 5221,
          flights: [
            { flight_number: "QR 274", extensions: ["Individuele suite"] },
            { flight_number: "QR 934", extensions: [] },
          ],
        },
      ],
    };
    const b = findMatchingBundle(res, { first: "274", second: "934" });
    expect(b?.price).toBe(5221);
  });

  it("returns null when flight numbers differ", () => {
    const res = {
      best_flights: [
        {
          flights: [{ flight_number: "QR 284" }, { flight_number: "QR 934" }],
        },
      ],
    };
    expect(findMatchingBundle(res, { first: "274", second: "934" })).toBeNull();
  });
});

describe("hasQsuiteSuiteMarkersInText", () => {
  it("detects Dutch suite copy", () => {
    expect(hasQsuiteSuiteMarkersInText('something "Individuele suite"')).toBe(true);
  });
});

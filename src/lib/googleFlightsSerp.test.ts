import { describe, expect, it } from "vitest";
import {
  extractOfficialAirlineDirectPrice,
  findMatchingBundle,
  findMatchingBundleByRoute,
  formatBundleFlightNumbers,
  hasQsuiteSuiteMarkersInText,
  legQrNumericId,
  redactSerpUrl,
  resolveTrackedBundle,
  summarizeFlightSearchForLog,
} from "@/lib/googleFlightsSerp";

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

  it("matches consecutive legs when itinerary has more than two segments", () => {
    const res = {
      other_flights: [
        {
          price: 1,
          flights: [
            { flight_number: "QR 274" },
            { flight_number: "QR 999" },
            { flight_number: "QR 934" },
          ],
        },
      ],
    };
    expect(findMatchingBundle(res, { first: "274", second: "934" })).toBeNull();
    const res2 = {
      other_flights: [
        {
          price: 2,
          flights: [
            { flight_number: "QR 274" },
            { flight_number: "QR 934" },
            { flight_number: "QR 100" },
          ],
        },
      ],
    };
    expect(findMatchingBundle(res2, { first: "274", second: "934" })?.price).toBe(2);
  });
});

describe("findMatchingBundleByRoute", () => {
  const route = { origin: "AMS", hub: "DOH", destination: "MNL" };

  it("finds two-leg AMS→DOH→MNL even when second leg is not QR934 (codeshare)", () => {
    const res = {
      other_flights: [
        {
          price: 5590,
          booking_token: "tok",
          flights: [
            {
              flight_number: "QR 274",
              departure_airport: { id: "AMS" },
              arrival_airport: { id: "DOH" },
            },
            {
              flight_number: "IB 7468",
              departure_airport: { id: "DOH" },
              arrival_airport: { id: "MNL" },
            },
          ],
        },
      ],
    };
    const b = findMatchingBundleByRoute(res, route);
    expect(b?.price).toBe(5590);
    expect(findMatchingBundle(res, { first: "274", second: "934" })).toBeNull();
  });
});

describe("resolveTrackedBundle", () => {
  it("prefers flight-number match, else route", () => {
    const route = { origin: "AMS", hub: "DOH", destination: "MNL" };
    const nums = { first: "274", second: "934" };
    const exactRes = {
      best_flights: [
        {
          flights: [
            { flight_number: "QR 274" },
            { flight_number: "QR 934" },
          ],
        },
      ],
    };
    expect(resolveTrackedBundle(exactRes, nums, route)?.kind).toBe("flight_numbers");

    const routeOnly = {
      other_flights: [
        {
          flights: [
            { flight_number: "QR 274", departure_airport: { id: "AMS" }, arrival_airport: { id: "DOH" } },
            { flight_number: "IB 1", departure_airport: { id: "DOH" }, arrival_airport: { id: "MNL" } },
          ],
        },
      ],
    };
    expect(resolveTrackedBundle(routeOnly, nums, route)?.kind).toBe("route");
  });
});

describe("formatBundleFlightNumbers", () => {
  it("joins leg flight numbers", () => {
    expect(
      formatBundleFlightNumbers({
        flights: [{ flight_number: "QR 274" }, { flight_number: "IB 7468" }],
      }),
    ).toBe("QR 274 + IB 7468");
  });
});

describe("legQrNumericId", () => {
  it("parses QR variants", () => {
    expect(legQrNumericId({ flight_number: "QR 274" })).toBe("274");
    expect(legQrNumericId({ flight_number: "QR274" })).toBe("274");
  });
});

describe("hasQsuiteSuiteMarkersInText", () => {
  it("detects Dutch suite copy", () => {
    expect(hasQsuiteSuiteMarkersInText('something "Individuele suite"')).toBe(true);
  });

  it("detects English Individual suite from SerpAPI extensions", () => {
    expect(hasQsuiteSuiteMarkersInText('["Individual suite","Free Wi-Fi"]')).toBe(true);
  });
});

describe("redactSerpUrl", () => {
  it("redacts api_key and shortens booking_token", () => {
    const u =
      "https://serpapi.com/search.json?engine=google_flights&api_key=SECRET123&booking_token=ABCDEFGHIJ";
    expect(redactSerpUrl(u)).toContain("api_key=(redacted)");
    expect(redactSerpUrl(u)).toContain("booking_token=(redacted,len=");
    expect(redactSerpUrl(u)).not.toContain("SECRET");
  });
});

describe("summarizeFlightSearchForLog", () => {
  it("counts bundles and samples leg pairs", () => {
    const res = {
      search_metadata: { status: "Success", id: "abc" },
      best_flights: [
        {
          flights: [{ flight_number: "QR 274" }, { flight_number: "QR 934" }],
          price: 100,
        },
      ],
      other_flights: [],
    };
    const s = summarizeFlightSearchForLog(res);
    expect(s.bestFlights).toBe(1);
    expect(s.sampleLegPairs[0]).toContain("QR");
  });
});

describe("extractOfficialAirlineDirectPrice", () => {
  it("picks Qatar Airways airline-direct row and ignores OTAs", () => {
    const booking_options = [
      {
        together: {
          book_with: "BudgetAir",
          airline_logos: [],
          price: 5597,
        },
      },
      {
        together: {
          book_with: "Qatar Airways",
          airline: true,
          price: 5716,
          local_prices: [{ currency: "EUR", price: 5716 }],
        },
      },
      {
        together: {
          book_with: "Booking.com",
          price: 5720,
        },
      },
    ];
    const p = extractOfficialAirlineDirectPrice(booking_options, "Qatar Airways", "EUR");
    expect(p?.price).toBe(5716);
    expect(p?.bookWith).toBe("Qatar Airways");
  });

  it("returns null when only OTAs exist", () => {
    const booking_options = [{ together: { book_with: "Gotogate", price: 100 } }];
    expect(extractOfficialAirlineDirectPrice(booking_options, "Qatar Airways", "EUR")).toBeNull();
  });
});

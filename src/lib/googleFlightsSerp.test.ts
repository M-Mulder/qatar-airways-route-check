import { describe, expect, it } from "vitest";
import {
  extractOfficialAirlineDirectPrice,
  findMatchingBundle,
  hasQsuiteSuiteMarkersInText,
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
});

describe("hasQsuiteSuiteMarkersInText", () => {
  it("detects Dutch suite copy", () => {
    expect(hasQsuiteSuiteMarkersInText('something "Individuele suite"')).toBe(true);
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

import {
  getTrackedBundleAdults,
  getTrackedBundleLegDates,
  type TrackedFlightNums,
} from "@/lib/trackedBundleConfig";

export type TrackedCabin = "ECONOMY" | "BUSINESS";

export type GoogleFlightsLeg = {
  flight_number?: string;
  extensions?: string[];
};

export type GoogleFlightsBundle = {
  flights?: GoogleFlightsLeg[];
  price?: number;
  layovers?: { duration?: number }[];
  /** Use with a follow-up SerpAPI request to read `booking_options` (airline vs OTA prices). */
  booking_token?: string;
};

export type GoogleFlightsApiResponse = {
  search_metadata?: { id?: string; status?: string };
  error?: string;
  search_parameters?: Record<string, unknown>;
  best_flights?: GoogleFlightsBundle[];
  other_flights?: GoogleFlightsBundle[];
};

export type BookingOptionTogether = {
  book_with?: string;
  /** When true, booking is with the airline (not a third-party OTA). */
  airline?: boolean;
  price?: number;
  local_prices?: { currency?: string; price?: number }[];
};

export type BookingOption = {
  together?: BookingOptionTogether;
  separate_tickets?: boolean;
};

/** Response shape when `booking_token` is passed (see SerpAPI “Google Flights Booking Options”). */
export type GoogleFlightsBookingApiResponse = {
  search_metadata?: { id?: string; status?: string };
  error?: string;
  booking_options?: BookingOption[];
  selected_flights?: unknown[];
  price_insights?: unknown;
};

const SERP_ENDPOINT = "https://serpapi.com/search.json";

function travelClassParam(cabin: TrackedCabin): string {
  return cabin === "BUSINESS" ? "3" : "1";
}

function isQrFlightNumber(leg: GoogleFlightsLeg, wantNum: string): boolean {
  const raw = (leg.flight_number || "").trim();
  const m = raw.match(/QR\s*(\d+)/i);
  return m !== null && m[1] === wantNum;
}

export function findMatchingBundle(
  res: GoogleFlightsApiResponse,
  nums: TrackedFlightNums,
): GoogleFlightsBundle | null {
  const lists = [...(res.best_flights ?? []), ...(res.other_flights ?? [])];
  for (const bundle of lists) {
    const legs = bundle.flights ?? [];
    if (legs.length !== 2) continue;
    if (isQrFlightNumber(legs[0]!, nums.first) && isQrFlightNumber(legs[1]!, nums.second)) {
      return bundle;
    }
  }
  return null;
}

function pickPriceInCurrency(together: BookingOptionTogether, currency: string): number | null {
  const cu = currency.trim().toUpperCase();
  const locals = together.local_prices ?? [];
  const hit = locals.find((p) => (p.currency || "").toUpperCase() === cu);
  if (hit && typeof hit.price === "number") return Math.round(hit.price);
  if (typeof together.price === "number") return Math.round(together.price);
  return null;
}

/**
 * From SerpAPI `booking_options`, pick the price for the official airline seller only
 * (`together.airline === true` and `book_with` matches), ignoring OTAs (BudgetAir, etc.).
 * If several fare rows exist for the same seller, returns the lowest price.
 */
export function extractOfficialAirlineDirectPrice(
  bookingOptions: BookingOption[] | undefined,
  officialBookWith: string,
  currency: string,
): { price: number; bookWith: string } | null {
  if (!bookingOptions?.length) return null;
  const want = officialBookWith.trim().toLowerCase();
  const candidates: { price: number; bookWith: string }[] = [];

  for (const opt of bookingOptions) {
    const t = opt.together;
    if (!t || t.airline !== true) continue;
    const bw = (t.book_with || "").trim();
    if (bw.toLowerCase() !== want) continue;
    const p = pickPriceInCurrency(t, currency);
    if (p != null) candidates.push({ price: p, bookWith: bw });
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.price <= b.price ? a : b));
}

/** Dutch UI copy from Google Flights NL; keep English variants for robustness. */
export function hasQsuiteSuiteMarkersInText(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("individuele suite") ||
    t.includes("individual suite") ||
    t.includes("qsuite") ||
    t.includes("q suite")
  );
}

export function qsuiteMarkersPresentForBundle(bundle: GoogleFlightsBundle): boolean {
  const blob = JSON.stringify(bundle);
  return hasQsuiteSuiteMarkersInText(blob);
}

/** Prefer amenities from the booking-options payload; fall back to the search bundle. */
export function qsuiteMarkersPresentForBusiness(
  cabin: TrackedCabin,
  booking: GoogleFlightsBookingApiResponse | null,
  searchBundle: GoogleFlightsBundle,
): boolean | null {
  if (cabin !== "BUSINESS") return null;
  const fromBooking = JSON.stringify(booking ?? {});
  if (hasQsuiteSuiteMarkersInText(fromBooking)) return true;
  return qsuiteMarkersPresentForBundle(searchBundle);
}

export async function fetchGoogleFlightsBundle(params: {
  apiKey: string;
  cabin: TrackedCabin;
  legDates?: ReturnType<typeof getTrackedBundleLegDates>;
  deepSearch?: boolean;
}): Promise<{ json: GoogleFlightsApiResponse; urlUsed: string }> {
  const legDates = params.legDates ?? getTrackedBundleLegDates();
  const adults = getTrackedBundleAdults();

  const multiCityJson = JSON.stringify([
    { departure_id: "AMS", arrival_id: "DOH", date: legDates.firstLegIso },
    { departure_id: "DOH", arrival_id: "MNL", date: legDates.secondLegIso },
  ]);

  const sp = new URLSearchParams({
    engine: "google_flights",
    api_key: params.apiKey,
    type: "3",
    multi_city_json: multiCityJson,
    travel_class: travelClassParam(params.cabin),
    hl: process.env.TRACKED_BUNDLE_HL?.trim() || "nl",
    gl: process.env.TRACKED_BUNDLE_GL?.trim() || "nl",
    currency: process.env.TRACKED_BUNDLE_CURRENCY?.trim() || "EUR",
    include_airlines: "QR",
    stops: "2",
    deep_search: params.deepSearch === false ? "false" : "true",
    adults: String(adults),
  });

  const urlUsed = `${SERP_ENDPOINT}?${sp.toString()}`;
  const r = await fetch(urlUsed, { method: "GET", cache: "no-store" });
  const json = (await r.json()) as GoogleFlightsApiResponse;

  if (!r.ok) {
    return {
      json: {
        ...json,
        error: json.error || `SerpAPI HTTP ${r.status}`,
      },
      urlUsed,
    };
  }

  return { json, urlUsed };
}

/**
 * Second SerpAPI call: loads `booking_options` for the chosen itinerary (airline-direct vs OTA prices).
 * @see https://serpapi.com/google-flights-booking-options
 */
export async function fetchGoogleFlightsBookingOptions(params: {
  apiKey: string;
  bookingToken: string;
}): Promise<{ json: GoogleFlightsBookingApiResponse; urlUsed: string }> {
  const adults = getTrackedBundleAdults();
  const sp = new URLSearchParams({
    engine: "google_flights",
    api_key: params.apiKey,
    booking_token: params.bookingToken,
    hl: process.env.TRACKED_BUNDLE_HL?.trim() || "nl",
    gl: process.env.TRACKED_BUNDLE_GL?.trim() || "nl",
    currency: process.env.TRACKED_BUNDLE_CURRENCY?.trim() || "EUR",
    adults: String(adults),
  });

  const urlUsed = `${SERP_ENDPOINT}?${sp.toString()}`;
  const r = await fetch(urlUsed, { method: "GET", cache: "no-store" });
  const json = (await r.json()) as GoogleFlightsBookingApiResponse;

  if (!r.ok) {
    return {
      json: {
        ...json,
        error: json.error || `SerpAPI HTTP ${r.status}`,
      },
      urlUsed,
    };
  }

  return { json, urlUsed };
}

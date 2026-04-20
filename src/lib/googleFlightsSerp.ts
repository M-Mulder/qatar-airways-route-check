import {
  getTrackedAirportRoute,
  getTrackedBundleAdults,
  getTrackedBundleLegDates,
  getTrackedFlightNumbers,
  type TrackedAirportRoute,
  type TrackedFlightNums,
} from "@/lib/trackedBundleConfig";

export type TrackedCabin = "ECONOMY" | "BUSINESS";

export type GoogleFlightsLeg = {
  flight_number?: string;
  /** Marketing carrier name when present (helps bare flight numbers). */
  airline?: string;
  departure_airport?: { id?: string; name?: string; time?: string };
  arrival_airport?: { id?: string; name?: string; time?: string };
  extensions?: string[];
};

export type GoogleFlightsBundle = {
  flights?: GoogleFlightsLeg[];
  price?: number;
  layovers?: { duration?: number }[];
  /** Use with a follow-up SerpAPI request to read `booking_options` (airline vs OTA prices). */
  booking_token?: string;
};

/** Human-readable leg list for DB/logs (e.g. `QR 274 + IB 7468`). */
export function formatBundleFlightNumbers(bundle: GoogleFlightsBundle): string {
  const legs = bundle.flights ?? [];
  return legs
    .map((l) => (l.flight_number ?? "?").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0)
    .join(" + ");
}

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

/** Set `PRICING_VERBOSE=0` to reduce `[pricing]` noise; default is verbose for Vercel debugging. */
function pricingVerbose(): boolean {
  return process.env.PRICING_VERBOSE?.trim() !== "0";
}

function logSerp(message: string, extra?: Record<string, unknown>) {
  if (!pricingVerbose()) return;
  if (extra && Object.keys(extra).length > 0) {
    console.log(`[pricing:serp] ${message}`, extra);
  } else {
    console.log(`[pricing:serp] ${message}`);
  }
}

/** Safe for logs (never includes api_key or full booking_token). */
export function redactSerpUrl(url: string): string {
  return url
    .replace(/api_key=[^&]*/i, "api_key=(redacted)")
    .replace(/booking_token=[^&]*/i, (m) => {
      const len = m.split("=")[1]?.length ?? 0;
      return `booking_token=(redacted,len=${len})`;
    });
}

/** Extract numeric flight id for Qatar-marketed legs (QR 274, QR274, sometimes with airline field). */
export function legQrNumericId(leg: GoogleFlightsLeg): string | null {
  const fn = (leg.flight_number || "").replace(/\s+/g, " ").trim();
  const qr = fn.match(/\bQR\s*0*(\d+)/i);
  if (qr) return String(parseInt(qr[1]!, 10));
  const air = (leg.airline || "").toLowerCase();
  if (air.includes("qatar") && /^\d{3,4}$/.test(fn.replace(/\s/g, ""))) {
    return String(parseInt(fn.replace(/\s/g, ""), 10));
  }
  return null;
}

/** When QR bundle is not found, log what SerpAPI did return (first N two-leg pairs). */
export function summarizeFlightSearchForLog(res: GoogleFlightsApiResponse): {
  searchStatus?: string;
  searchId?: string;
  bestFlights: number;
  otherFlights: number;
  sampleLegPairs: string[];
  bundleDebug?: { legCount: number; flightNumbers: (string | undefined)[]; price?: number }[];
  topListPrice?: number;
} {
  const pairs: string[] = [];
  const take = (bundles: GoogleFlightsBundle[] | undefined, max: number) => {
    for (const b of bundles ?? []) {
      if (pairs.length >= max) break;
      const fs = b.flights ?? [];
      if (fs.length >= 2) {
        pairs.push(`${fs[0]?.flight_number ?? "?"}→${fs[1]?.flight_number ?? "?"}`);
      } else if (fs.length === 1) {
        pairs.push(`${fs[0]?.flight_number ?? "?"} (single leg)`);
      }
    }
  };
  take(res.best_flights, 12);
  take(res.other_flights, 12);
  const firstPrice =
    res.best_flights?.[0]?.price ?? res.other_flights?.[0]?.price;

  const bundleDebug = [...(res.best_flights ?? []).slice(0, 2), ...(res.other_flights ?? []).slice(0, 3)].map(
    (b) => ({
      legCount: b.flights?.length ?? 0,
      flightNumbers: (b.flights ?? []).map((f) => f.flight_number),
      price: typeof b.price === "number" ? b.price : undefined,
    }),
  );

  return {
    searchStatus: res.search_metadata?.status,
    searchId: res.search_metadata?.id,
    bestFlights: res.best_flights?.length ?? 0,
    otherFlights: res.other_flights?.length ?? 0,
    sampleLegPairs: pairs.slice(0, 16),
    bundleDebug: bundleDebug.length ? bundleDebug : undefined,
    topListPrice: typeof firstPrice === "number" ? firstPrice : undefined,
  };
}

/** Log all booking rows (seller + airline flag + price) for debugging OTA vs direct. */
export function summarizeBookingOptionsForLog(options: BookingOption[] | undefined): {
  count: number;
  rows: { bookWith: string; airline: boolean | null; price: number | null }[];
} {
  const rows: { bookWith: string; airline: boolean | null; price: number | null }[] = [];
  for (const opt of options ?? []) {
    const t = opt.together;
    if (!t) continue;
    rows.push({
      bookWith: (t.book_with || "").trim() || "(empty)",
      airline: typeof t.airline === "boolean" ? t.airline : null,
      price: typeof t.price === "number" ? t.price : null,
    });
    if (rows.length >= 24) break;
  }
  return { count: options?.length ?? 0, rows };
}

function travelClassParam(cabin: TrackedCabin): string {
  return cabin === "BUSINESS" ? "3" : "1";
}

export function findMatchingBundle(
  res: GoogleFlightsApiResponse,
  nums: TrackedFlightNums,
): GoogleFlightsBundle | null {
  const lists = [...(res.best_flights ?? []), ...(res.other_flights ?? [])];
  for (const bundle of lists) {
    const legs = bundle.flights ?? [];
    for (let i = 0; i < legs.length - 1; i++) {
      const a = legQrNumericId(legs[i]!);
      const b = legQrNumericId(legs[i + 1]!);
      if (a === nums.first && b === nums.second) {
        return bundle;
      }
    }
  }
  return null;
}

function legAirportPair(leg: GoogleFlightsLeg): { dep?: string; arr?: string } {
  const dep = leg.departure_airport?.id?.trim().toUpperCase();
  const arr = leg.arrival_airport?.id?.trim().toUpperCase();
  return { dep: dep || undefined, arr: arr || undefined };
}

/**
 * Match the same itinerary Google Flights shows as “AMS → DOH → MNL” even when the second segment
 * is a codeshare (e.g. Iberia flight number) and not `QR {second}` — SerpAPI still exposes IATA ids per leg.
 */
export function findMatchingBundleByRoute(
  res: GoogleFlightsApiResponse,
  route: TrackedAirportRoute,
): GoogleFlightsBundle | null {
  const o = route.origin;
  const h = route.hub;
  const dest = route.destination;
  const lists = [...(res.best_flights ?? []), ...(res.other_flights ?? [])];
  for (const bundle of lists) {
    const legs = bundle.flights ?? [];
    for (let i = 0; i < legs.length - 1; i++) {
      const a = legAirportPair(legs[i]!);
      const b = legAirportPair(legs[i + 1]!);
      if (a.dep === o && a.arr === h && b.dep === h && b.arr === dest) {
        return bundle;
      }
    }
  }
  return null;
}

export type TrackedBundleMatchKind = "flight_numbers" | "route";

/** Prefer exact QR flight numbers; optionally fall back to AMS→DOH→MNL by airport ids (codeshare-friendly). */
export function resolveTrackedBundle(
  res: GoogleFlightsApiResponse,
  nums: TrackedFlightNums,
  route: TrackedAirportRoute,
): { bundle: GoogleFlightsBundle; kind: TrackedBundleMatchKind } | null {
  const exact = findMatchingBundle(res, nums);
  if (exact) return { bundle: exact, kind: "flight_numbers" };
  if (process.env.TRACKED_BUNDLE_SKIP_ROUTE_FALLBACK?.trim() === "1") return null;
  const byRoute = findMatchingBundleByRoute(res, route);
  if (byRoute) return { bundle: byRoute, kind: "route" };
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

/**
 * Dutch / English amenity strings from Google Flights (SerpAPI `flights[].extensions`).
 * Business itineraries often include `"Individual suite"` (EN) or `"Individuele suite"` (NL) when Qsuite is listed.
 */
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

function commonSearchParams(params: {
  apiKey: string;
  cabin: TrackedCabin;
  deepSearch: boolean;
}): URLSearchParams {
  const adults = getTrackedBundleAdults();
  const sp = new URLSearchParams({
    engine: "google_flights",
    api_key: params.apiKey,
    travel_class: travelClassParam(params.cabin),
    hl: process.env.TRACKED_BUNDLE_HL?.trim() || "nl",
    gl: process.env.TRACKED_BUNDLE_GL?.trim() || "nl",
    currency: process.env.TRACKED_BUNDLE_CURRENCY?.trim() || "EUR",
    include_airlines: "QR",
    stops: "2",
    deep_search: params.deepSearch === false ? "false" : "true",
    adults: String(adults),
  });
  // Same as Google Flights “View more flights” — needed for long-DOH options (e.g. QR274+QR934, 18h30 layover).
  if (process.env.TRACKED_BUNDLE_SHOW_HIDDEN?.trim() !== "0") {
    sp.set("show_hidden", "true");
  }
  return sp;
}

async function runFlightSearchRequest(opts: {
  cabin: TrackedCabin;
  mode: "multi_city" | "one_way";
  sp: URLSearchParams;
  extraLog?: Record<string, unknown>;
}): Promise<{ json: GoogleFlightsApiResponse; urlUsed: string; httpOk: boolean }> {
  const urlUsed = `${SERP_ENDPOINT}?${opts.sp.toString()}`;
  logSerp(`${opts.mode} search request`, {
    cabin: opts.cabin,
    travelClass: travelClassParam(opts.cabin),
    ...opts.extraLog,
    url: redactSerpUrl(urlUsed),
  });

  const t0 = Date.now();
  const r = await fetch(urlUsed, { method: "GET", cache: "no-store" });
  const json = (await r.json()) as GoogleFlightsApiResponse;
  const ms = Date.now() - t0;

  logSerp(`${opts.mode} search response`, {
    cabin: opts.cabin,
    httpStatus: r.status,
    ms,
    ...summarizeFlightSearchForLog(json),
    serpError: json.error ?? null,
  });

  if (!r.ok) {
    return {
      json: {
        ...json,
        error: json.error || `SerpAPI HTTP ${r.status}`,
      },
      urlUsed,
      httpOk: false,
    };
  }
  return { json, urlUsed, httpOk: true };
}

/**
 * SerpAPI: multi-city JSON pins AMS→DOH and DOH→MNL dates (overnight layover).
 * If no QR274+934 bundle is found, we fall back to **one-way** AMS→MNL on the first leg date — same as the Google Flights UI “one way with stop”, which often returns a cleaner 2-leg `flights` array.
 */
export async function fetchGoogleFlightsBundle(params: {
  apiKey: string;
  cabin: TrackedCabin;
  legDates?: ReturnType<typeof getTrackedBundleLegDates>;
  deepSearch?: boolean;
}): Promise<{ json: GoogleFlightsApiResponse; urlUsed: string }> {
  const legDates = params.legDates ?? getTrackedBundleLegDates();
  const nums = getTrackedFlightNumbers();
  const route = getTrackedAirportRoute();
  const deep = params.deepSearch !== false;

  const multiCityJson = JSON.stringify([
    { departure_id: "AMS", arrival_id: "DOH", date: legDates.firstLegIso },
    { departure_id: "DOH", arrival_id: "MNL", date: legDates.secondLegIso },
  ]);

  const spMulti = commonSearchParams({ apiKey: params.apiKey, cabin: params.cabin, deepSearch: deep });
  spMulti.set("type", "3");
  spMulti.set("multi_city_json", multiCityJson);

  const first = await runFlightSearchRequest({
    cabin: params.cabin,
    mode: "multi_city",
    sp: spMulti,
    extraLog: { multiCity: multiCityJson },
  });

  const matchFirst = !first.json.error && resolveTrackedBundle(first.json, nums, route) !== null;
  if (first.httpOk && matchFirst) {
    return { json: first.json, urlUsed: first.urlUsed };
  }

  if (process.env.TRACKED_BUNDLE_SKIP_ONE_WAY_FALLBACK?.trim() === "1") {
    return { json: first.json, urlUsed: first.urlUsed };
  }

  logSerp("no QR bundle on multi_city (or error); trying one_way AMS→MNL fallback", {
    firstLegDate: legDates.firstLegIso,
  });

  const spOw = commonSearchParams({ apiKey: params.apiKey, cabin: params.cabin, deepSearch: deep });
  spOw.set("type", "2");
  spOw.set("departure_id", "AMS");
  spOw.set("arrival_id", "MNL");
  spOw.set("outbound_date", legDates.firstLegIso);

  const second = await runFlightSearchRequest({
    cabin: params.cabin,
    mode: "one_way",
    sp: spOw,
    extraLog: { outbound_date: legDates.firstLegIso, departure_id: "AMS", arrival_id: "MNL" },
  });

  const matchSecond = !second.json.error && resolveTrackedBundle(second.json, nums, route) !== null;
  if (second.httpOk && matchSecond) {
    return { json: second.json, urlUsed: second.urlUsed };
  }

  // Prefer one-way JSON when we fetched it: two-leg rows + same shape as the Google Flights UI for AMS→MNL.
  if (second.httpOk) {
    return { json: second.json, urlUsed: second.urlUsed };
  }

  return { json: first.json, urlUsed: first.urlUsed };
}

/**
 * Second SerpAPI call: loads `booking_options` for the chosen itinerary (airline-direct vs OTA prices).
 * Must repeat route + trip context (`departure_id`, `arrival_id`, `type`, `outbound_date`, `travel_class`) —
 * SerpAPI returns 400 `Missing departure_id parameter` if only `booking_token` is sent.
 * @see https://serpapi.com/google-flights-booking-options
 */
export async function fetchGoogleFlightsBookingOptions(params: {
  apiKey: string;
  bookingToken: string;
  cabin: TrackedCabin;
}): Promise<{ json: GoogleFlightsBookingApiResponse; urlUsed: string }> {
  const adults = getTrackedBundleAdults();
  const route = getTrackedAirportRoute();
  const legDates = getTrackedBundleLegDates();
  const sp = new URLSearchParams({
    engine: "google_flights",
    api_key: params.apiKey,
    booking_token: params.bookingToken,
    departure_id: route.origin,
    arrival_id: route.destination,
    /** One-way AMS→MNL — matches our primary `fetchGoogleFlightsBundle` fallback and booking_token shape. */
    type: "2",
    outbound_date: legDates.firstLegIso,
    travel_class: travelClassParam(params.cabin),
    hl: process.env.TRACKED_BUNDLE_HL?.trim() || "nl",
    gl: process.env.TRACKED_BUNDLE_GL?.trim() || "nl",
    currency: process.env.TRACKED_BUNDLE_CURRENCY?.trim() || "EUR",
    adults: String(adults),
  });

  const urlUsed = `${SERP_ENDPOINT}?${sp.toString()}`;
  logSerp("booking_options request", {
    bookingTokenLen: params.bookingToken.length,
    departure_id: sp.get("departure_id"),
    arrival_id: sp.get("arrival_id"),
    type: sp.get("type"),
    outbound_date: sp.get("outbound_date"),
    travel_class: sp.get("travel_class"),
    hl: sp.get("hl"),
    currency: sp.get("currency"),
    adults: sp.get("adults"),
    url: redactSerpUrl(urlUsed),
  });

  const t0 = Date.now();
  const r = await fetch(urlUsed, { method: "GET", cache: "no-store" });
  const json = (await r.json()) as GoogleFlightsBookingApiResponse;
  const ms = Date.now() - t0;

  const optSummary = summarizeBookingOptionsForLog(json.booking_options);
  logSerp("booking_options response", {
    httpStatus: r.status,
    ms,
    searchStatus: json.search_metadata?.status,
    searchId: json.search_metadata?.id,
    bookingOptionsCount: optSummary.count,
    bookingRowsPreview: optSummary.rows,
    selectedFlightsLen: Array.isArray(json.selected_flights) ? json.selected_flights.length : 0,
    serpError: json.error ?? null,
  });

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

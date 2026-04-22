import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { extractOfficialAirlineDirectPrice, legQrNumericId, redactSerpUrl } from "@/lib/googleFlightsSerp";
import { getTrackedOfficialBookWith } from "@/lib/trackedBundleConfig";

type TrackedCabin = "BUSINESS";

type GoogleFlightsLeg = {
  flight_number?: string;
  airline?: string;
  departure_airport?: { id?: string };
  arrival_airport?: { id?: string };
};

type GoogleFlightsBundle = {
  flights?: GoogleFlightsLeg[];
  booking_token?: string;
  price?: number;
};

type GoogleFlightsApiResponse = {
  error?: string;
  search_metadata?: { id?: string; status?: string };
  best_flights?: GoogleFlightsBundle[];
  other_flights?: GoogleFlightsBundle[];
};

type BookingOptionTogether = {
  book_with?: string;
  airline?: boolean;
  price?: number;
  local_prices?: { currency?: string; price?: number }[];
};

type BookingOption = { together?: BookingOptionTogether };

type GoogleFlightsBookingApiResponse = {
  error?: string;
  search_metadata?: { id?: string; status?: string };
  booking_options?: BookingOption[];
};

const SERP_ENDPOINT = "https://serpapi.com/search.json";

function travelClassParam(_cabin: TrackedCabin): string {
  return "3";
}

function pickBundleQr274AmsDoh(res: GoogleFlightsApiResponse): GoogleFlightsBundle | null {
  const bundles = [...(res.best_flights ?? []), ...(res.other_flights ?? [])];
  for (const b of bundles) {
    const legs = b.flights ?? [];
    if (legs.length < 1) continue;
    const l0 = legs[0]!;
    const dep = l0.departure_airport?.id?.trim().toUpperCase();
    const arr = l0.arrival_airport?.id?.trim().toUpperCase();
    if (dep !== "AMS" || arr !== "DOH") continue;
    const n = legQrNumericId(l0 as any);
    if (n === "274") return b;
  }
  return null;
}

async function fetchOneWaySearch(params: {
  apiKey: string;
  outboundDateIso: string;
  currency: string;
  adults: number;
  cabin: TrackedCabin;
}): Promise<{ json: GoogleFlightsApiResponse; urlUsed: string; httpOk: boolean }> {
  const sp = new URLSearchParams({
    engine: "google_flights",
    api_key: params.apiKey,
    type: "2",
    departure_id: "AMS",
    arrival_id: "DOH",
    outbound_date: params.outboundDateIso,
    travel_class: travelClassParam(params.cabin),
    hl: process.env.TRACKED_BUNDLE_HL?.trim() || "nl",
    gl: process.env.TRACKED_BUNDLE_GL?.trim() || "nl",
    currency: params.currency,
    adults: String(params.adults),
  });

  const urlUsed = `${SERP_ENDPOINT}?${sp.toString()}`;
  const t0 = Date.now();
  const r = await fetch(urlUsed, { method: "GET", cache: "no-store" });
  const ms = Date.now() - t0;
  const json = (await r.json()) as GoogleFlightsApiResponse;
  if (process.env.PRICING_VERBOSE?.trim() !== "0") {
    console.log("[qr274] serp search", {
      httpStatus: r.status,
      ms,
      url: redactSerpUrl(urlUsed),
      status: json.search_metadata?.status ?? null,
      serpId: json.search_metadata?.id ?? null,
      serpError: json.error ?? null,
      best: json.best_flights?.length ?? 0,
      other: json.other_flights?.length ?? 0,
    });
  }
  return { json, urlUsed, httpOk: r.ok };
}

async function fetchBookingOptions(params: {
  apiKey: string;
  outboundDateIso: string;
  bookingToken: string;
  currency: string;
  adults: number;
  cabin: TrackedCabin;
}): Promise<{ json: GoogleFlightsBookingApiResponse; urlUsed: string; httpOk: boolean }> {
  const sp = new URLSearchParams({
    engine: "google_flights",
    api_key: params.apiKey,
    booking_token: params.bookingToken,
    departure_id: "AMS",
    arrival_id: "DOH",
    type: "2",
    outbound_date: params.outboundDateIso,
    travel_class: travelClassParam(params.cabin),
    hl: process.env.TRACKED_BUNDLE_HL?.trim() || "nl",
    gl: process.env.TRACKED_BUNDLE_GL?.trim() || "nl",
    currency: params.currency,
    adults: String(params.adults),
  });
  const urlUsed = `${SERP_ENDPOINT}?${sp.toString()}`;
  const r = await fetch(urlUsed, { method: "GET", cache: "no-store" });
  const json = (await r.json()) as GoogleFlightsBookingApiResponse;
  return { json, urlUsed, httpOk: r.ok };
}

export type Qr274CalendarDayPrice = {
  date: string; // YYYY-MM-DD
  currency: string;
  /** Airline-direct price (preferred), else list price fallback. */
  price: number | null;
  /** Mock award pricing (demo-only): 43k or 86k. */
  avios: number | null;
  source: "airline_direct" | "list" | "missing";
  serpSearchId: string | null;
  error: string | null;
};

export async function fetchQr274BusinessCalendarMonth(params: {
  apiKey: string;
  monthIso: string; // YYYY-MM
  currency?: string;
  adults?: number;
  concurrency?: number;
}): Promise<{ monthIso: string; cabin: TrackedCabin; prices: Qr274CalendarDayPrice[] }> {
  const monthIso = params.monthIso;
  const currency = (params.currency || "EUR").trim().toUpperCase();
  const adults = params.adults ?? 1;
  const concurrency = Math.max(1, Math.min(6, params.concurrency ?? 3));
  const cabin: TrackedCabin = "BUSINESS";

  if (!/^\d{4}-\d{2}$/.test(monthIso)) {
    throw new Error(`Invalid monthIso: ${monthIso}`);
  }

  const monthStart = startOfMonth(new Date(`${monthIso}-01T12:00:00.000Z`));
  const monthEnd = endOfMonth(monthStart);

  const dates: string[] = [];
  for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) {
    dates.push(format(d, "yyyy-MM-dd"));
  }

  const officialSeller = getTrackedOfficialBookWith() || "Qatar Airways";

  const out: Qr274CalendarDayPrice[] = new Array(dates.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, dates.length) }, () => async () => {
    while (true) {
      const i = idx++;
      if (i >= dates.length) return;
      const date = dates[i]!;
      try {
        const { json } = await fetchOneWaySearch({
          apiKey: params.apiKey,
          outboundDateIso: date,
          currency,
          adults,
          cabin,
        });

        if (json.error || json.search_metadata?.status === "Error") {
          out[i] = {
            date,
            currency,
            price: null,
            avios: null,
            source: "missing",
            serpSearchId: json.search_metadata?.id ?? null,
            error: json.error || "SerpAPI error",
          };
          continue;
        }

        const bundle = pickBundleQr274AmsDoh(json);
        if (!bundle) {
          out[i] = {
            date,
            currency,
            price: null,
            avios: null,
            source: "missing",
            serpSearchId: json.search_metadata?.id ?? null,
            error: "QR274 AMS→DOH not found in Serp results",
          };
          continue;
        }

        const token = (bundle.booking_token || "").trim();
        if (!token) {
          const list = typeof bundle.price === "number" ? Math.round(bundle.price) : null;
          out[i] = {
            date,
            currency,
            price: list,
            avios: null,
            source: list == null ? "missing" : "list",
            serpSearchId: json.search_metadata?.id ?? null,
            error: list == null ? "Missing booking_token and list price" : "Missing booking_token; using list price",
          };
          continue;
        }

        const booking = await fetchBookingOptions({
          apiKey: params.apiKey,
          outboundDateIso: date,
          bookingToken: token,
          currency,
          adults,
          cabin,
        });

        if (booking.json.error || booking.json.search_metadata?.status === "Error") {
          const list = typeof bundle.price === "number" ? Math.round(bundle.price) : null;
          out[i] = {
            date,
            currency,
            price: list,
            avios: null,
            source: list == null ? "missing" : "list",
            serpSearchId: json.search_metadata?.id ?? null,
            error: booking.json.error || "booking_options error",
          };
          continue;
        }

        const picked = extractOfficialAirlineDirectPrice(booking.json.booking_options as any, officialSeller, currency);
        if (picked) {
          out[i] = {
            date,
            currency,
            price: picked.price,
            avios: null,
            source: "airline_direct",
            serpSearchId: json.search_metadata?.id ?? null,
            error: null,
          };
        } else {
          const list = typeof bundle.price === "number" ? Math.round(bundle.price) : null;
          out[i] = {
            date,
            currency,
            price: list,
            avios: null,
            source: list == null ? "missing" : "list",
            serpSearchId: json.search_metadata?.id ?? null,
            error: "No airline-direct row in booking_options; using list price",
          };
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        out[i] = { date, currency, price: null, avios: null, source: "missing", serpSearchId: null, error: message };
      }
    }
  });

  await Promise.all(workers.map((w) => w()));
  return { monthIso, cabin, prices: out };
}


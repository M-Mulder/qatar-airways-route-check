import { getTrackedBundleLegDates, type TrackedFlightNums } from "@/lib/trackedBundleConfig";

export type TrackedCabin = "ECONOMY" | "BUSINESS";

export type GoogleFlightsLeg = {
  flight_number?: string;
  extensions?: string[];
};

export type GoogleFlightsBundle = {
  flights?: GoogleFlightsLeg[];
  price?: number;
  layovers?: { duration?: number }[];
};

export type GoogleFlightsApiResponse = {
  search_metadata?: { id?: string; status?: string };
  error?: string;
  search_parameters?: Record<string, unknown>;
  best_flights?: GoogleFlightsBundle[];
  other_flights?: GoogleFlightsBundle[];
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

export async function fetchGoogleFlightsBundle(params: {
  apiKey: string;
  cabin: TrackedCabin;
  legDates?: ReturnType<typeof getTrackedBundleLegDates>;
  deepSearch?: boolean;
}): Promise<{ json: GoogleFlightsApiResponse; urlUsed: string }> {
  const legDates = params.legDates ?? getTrackedBundleLegDates();

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
    adults: "1",
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

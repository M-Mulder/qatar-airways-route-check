import {
  extractOfficialAirlineDirectPrice,
  fetchGoogleFlightsBookingOptions,
  fetchGoogleFlightsBundle,
  findMatchingBundle,
  qsuiteMarkersPresentForBusiness,
  type GoogleFlightsBookingApiResponse,
  type TrackedCabin,
} from "@/lib/googleFlightsSerp";
import { getPrisma } from "@/lib/prisma";
import {
  getTrackedBundleLegDates,
  getTrackedFlightNumbers,
  getTrackedOfficialBookWith,
} from "@/lib/trackedBundleConfig";

export type TrackedBundleCabinResult = {
  cabin: TrackedCabin;
  ok: boolean;
  matchedBundle: boolean;
  priceTotal: number | null;
  currency: string;
  qsuiteIndicatorsPresent: boolean | null;
  flightNumbersSummary: string | null;
  error: string | null;
  serpSearchId: string | null;
};

function cabinToPrisma(c: TrackedCabin): string {
  return c;
}

export async function runTrackedBundlePriceSnapshots(): Promise<{
  skipped: boolean;
  reason?: string;
  results: TrackedBundleCabinResult[];
}> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) {
    return { skipped: true, reason: "SERPAPI_KEY not set", results: [] };
  }

  const prisma = getPrisma();
  if (!prisma) {
    return { skipped: true, reason: "Database unavailable", results: [] };
  }

  const legDates = getTrackedBundleLegDates();
  const nums = getTrackedFlightNumbers();
  const bundleFirstLegDate = new Date(`${legDates.firstLegIso}T12:00:00.000Z`);
  const currency = process.env.TRACKED_BUNDLE_CURRENCY?.trim() || "EUR";
  const officialSeller = getTrackedOfficialBookWith();

  const cabins: TrackedCabin[] = ["ECONOMY", "BUSINESS"];
  const results: TrackedBundleCabinResult[] = [];

  for (const cabin of cabins) {
    let json;
    try {
      ({ json } = await fetchGoogleFlightsBundle({ apiKey: key, cabin, legDates }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({
        cabin,
        ok: false,
        matchedBundle: false,
        priceTotal: null,
        currency,
        qsuiteIndicatorsPresent: null,
        flightNumbersSummary: null,
        error: message,
        serpSearchId: null,
      });
      await prisma.trackedBundlePriceSnapshot.create({
        data: {
          bundleFirstLegDate,
          cabin: cabinToPrisma(cabin),
          priceTotal: null,
          currency,
          matchedBundle: false,
          qsuiteIndicatorsPresent: null,
          flightNumbersSummary: null,
          error: message,
          serpSearchId: null,
        },
      });
      continue;
    }

    const metaErr = json.error;
    const status = json.search_metadata?.status;
    if (metaErr || status === "Error") {
      const errText = metaErr || "SerpAPI search failed";
      results.push({
        cabin,
        ok: false,
        matchedBundle: false,
        priceTotal: null,
        currency,
        qsuiteIndicatorsPresent: null,
        flightNumbersSummary: null,
        error: errText,
        serpSearchId: json.search_metadata?.id ?? null,
      });
      await prisma.trackedBundlePriceSnapshot.create({
        data: {
          bundleFirstLegDate,
          cabin: cabinToPrisma(cabin),
          priceTotal: null,
          currency,
          matchedBundle: false,
          qsuiteIndicatorsPresent: null,
          flightNumbersSummary: null,
          error: errText,
          serpSearchId: json.search_metadata?.id ?? null,
        },
      });
      continue;
    }

    const bundle = findMatchingBundle(json, nums);
    const matched = bundle !== null;

    let priceTotal: number | null = null;
    let bookingJson: GoogleFlightsBookingApiResponse | null = null;
    let detailError: string | null = null;

    if (matched && bundle) {
      const token = bundle.booking_token?.trim();
      if (!token) {
        detailError =
          "Matched QR itinerary but SerpAPI bundle had no booking_token; cannot load booking options for airline-direct price.";
      } else {
        try {
          ({ json: bookingJson } = await fetchGoogleFlightsBookingOptions({
            apiKey: key,
            bookingToken: token,
          }));
          const bErr = bookingJson.error;
          const bStatus = bookingJson.search_metadata?.status;
          if (bErr || bStatus === "Error") {
            detailError = bErr || "SerpAPI booking_options request failed";
          } else {
            const picked = extractOfficialAirlineDirectPrice(
              bookingJson.booking_options,
              officialSeller,
              currency,
            );
            if (picked) {
              priceTotal = picked.price;
            } else {
              detailError = `No airline-direct "${officialSeller}" row in booking_options (OTAs only or seller name mismatch).`;
            }
          }
        } catch (e) {
          detailError = e instanceof Error ? e.message : String(e);
        }
      }
    }

    const qsuiteIndicatorsPresent =
      matched && bundle
        ? qsuiteMarkersPresentForBusiness(cabin, bookingJson, bundle)
        : null;

    const baseErr = matched ? null : `No QR${nums.first}+QR${nums.second} itinerary in SerpAPI results`;
    const error = [baseErr, detailError].filter(Boolean).join(" ") || null;

    results.push({
      cabin,
      ok: true,
      matchedBundle: matched,
      priceTotal,
      currency,
      qsuiteIndicatorsPresent,
      flightNumbersSummary: matched ? `QR${nums.first}+QR${nums.second}` : null,
      error,
      serpSearchId: json.search_metadata?.id ?? null,
    });

    await prisma.trackedBundlePriceSnapshot.create({
      data: {
        bundleFirstLegDate,
        cabin: cabinToPrisma(cabin),
        priceTotal,
        currency,
        matchedBundle: matched,
        qsuiteIndicatorsPresent,
        flightNumbersSummary: matched ? `QR${nums.first}+QR${nums.second}` : null,
        error,
        serpSearchId: json.search_metadata?.id ?? null,
      },
    });
  }

  return { skipped: false, results };
}

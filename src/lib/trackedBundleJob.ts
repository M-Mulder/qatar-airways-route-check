import {
  fetchGoogleFlightsBundle,
  findMatchingBundle,
  qsuiteMarkersPresentForBundle,
  type TrackedCabin,
} from "@/lib/googleFlightsSerp";
import { getPrisma } from "@/lib/prisma";
import { getTrackedBundleLegDates, getTrackedFlightNumbers } from "@/lib/trackedBundleConfig";

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
    const priceTotal = typeof bundle?.price === "number" ? Math.round(bundle.price) : null;
    const qsuiteIndicatorsPresent =
      cabin === "BUSINESS" && matched && bundle ? qsuiteMarkersPresentForBundle(bundle) : null;

    results.push({
      cabin,
      ok: true,
      matchedBundle: matched,
      priceTotal,
      currency,
      qsuiteIndicatorsPresent,
      flightNumbersSummary: matched ? `QR${nums.first}+QR${nums.second}` : null,
      error: matched ? null : `No QR${nums.first}+QR${nums.second} itinerary in SerpAPI results`,
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
        error: matched ? null : `No QR${nums.first}+QR${nums.second} itinerary in SerpAPI results`,
        serpSearchId: json.search_metadata?.id ?? null,
      },
    });
  }

  return { skipped: false, results };
}

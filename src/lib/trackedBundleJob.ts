import {
  extractOfficialAirlineDirectPrice,
  fetchGoogleFlightsBookingOptions,
  fetchGoogleFlightsBundle,
  formatBundleFlightNumbers,
  qsuiteMarkersPresentForBusiness,
  resolveTrackedBundle,
  summarizeBookingOptionsForLog,
  summarizeFlightSearchForLog,
  type GoogleFlightsBookingApiResponse,
  type TrackedCabin,
} from "@/lib/googleFlightsSerp";
import { getPrisma } from "@/lib/prisma";
import {
  getTrackedAirportRoute,
  getTrackedBundleAdults,
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
  /** False when Prisma insert failed (e.g. missing migration / table). */
  dbPersisted?: boolean;
  dbError?: string | null;
};

function cabinToPrisma(c: TrackedCabin): string {
  return c;
}

function logPricing(message: string, extra?: Record<string, unknown>) {
  if (extra && Object.keys(extra).length > 0) {
    console.log(`[pricing] ${message}`, extra);
  } else {
    console.log(`[pricing] ${message}`);
  }
}

export async function runTrackedBundlePriceSnapshots(): Promise<{
  skipped: boolean;
  reason?: string;
  results: TrackedBundleCabinResult[];
}> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) {
    logPricing("skip: SERPAPI_KEY unset");
    return { skipped: true, reason: "SERPAPI_KEY not set", results: [] };
  }

  const prisma = getPrisma();
  if (!prisma) {
    logPricing("skip: Prisma client null (DATABASE_URL?)");
    return { skipped: true, reason: "Database unavailable", results: [] };
  }

  const legDates = getTrackedBundleLegDates();
  const nums = getTrackedFlightNumbers();
  const route = getTrackedAirportRoute();
  const adults = getTrackedBundleAdults();
  const bundleFirstLegDate = new Date(`${legDates.firstLegIso}T12:00:00.000Z`);
  const currency = process.env.TRACKED_BUNDLE_CURRENCY?.trim() || "EUR";
  const officialSeller = getTrackedOfficialBookWith();

  const tJobStart = Date.now();
  logPricing("start", {
    firstLeg: legDates.firstLegIso,
    secondLeg: legDates.secondLegIso,
    bundleFirstLegDate: bundleFirstLegDate.toISOString().slice(0, 10),
    flights: `QR${nums.first}+QR${nums.second} or ${route.origin}→${route.hub}→${route.destination}`,
    adults,
    currency,
    officialSeller,
  });

  const cabins: TrackedCabin[] = ["ECONOMY", "BUSINESS"];
  const results: TrackedBundleCabinResult[] = [];

  const persist = async (data: Parameters<typeof prisma.trackedBundlePriceSnapshot.create>[0]["data"]) => {
    try {
      await prisma.trackedBundlePriceSnapshot.create({ data });
      return { ok: true as const, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logPricing("db insert failed", { message: msg });
      return { ok: false as const, error: msg };
    }
  };

  for (const cabin of cabins) {
    let json;
    try {
      ({ json } = await fetchGoogleFlightsBundle({ apiKey: key, cabin, legDates }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logPricing(`cabin ${cabin}: search request threw`, { message });
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
      const p = await persist({
        bundleFirstLegDate,
        cabin: cabinToPrisma(cabin),
        priceTotal: null,
        currency,
        matchedBundle: false,
        qsuiteIndicatorsPresent: null,
        flightNumbersSummary: null,
        error: message,
        serpSearchId: null,
      });
      results[results.length - 1]!.dbPersisted = p.ok;
      results[results.length - 1]!.dbError = p.error;
      continue;
    }

    const metaErr = json.error;
    const status = json.search_metadata?.status;
    if (metaErr || status === "Error") {
      const errText = metaErr || "SerpAPI search failed";
      logPricing(`cabin ${cabin}: SerpAPI search error`, { errText, status });
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
      const p = await persist({
        bundleFirstLegDate,
        cabin: cabinToPrisma(cabin),
        priceTotal: null,
        currency,
        matchedBundle: false,
        qsuiteIndicatorsPresent: null,
        flightNumbersSummary: null,
        error: errText,
        serpSearchId: json.search_metadata?.id ?? null,
      });
      results[results.length - 1]!.dbPersisted = p.ok;
      results[results.length - 1]!.dbError = p.error;
      continue;
    }

    const resolved = resolveTrackedBundle(json, nums, route);
    const bundle = resolved?.bundle ?? null;
    const matched = bundle !== null;
    logPricing(`cabin ${cabin}: search ok`, {
      matched,
      matchKind: resolved?.kind ?? null,
      serpId: json.search_metadata?.id,
      hasBookingToken: Boolean(bundle?.booking_token),
      bundleListPrice: typeof bundle?.price === "number" ? bundle.price : null,
    });
    if (matched && resolved?.kind === "route") {
      logPricing(`cabin ${cabin}: matched by airport route (second leg may be codeshare / not QR${nums.second})`, {
        legs: bundle ? formatBundleFlightNumbers(bundle) : null,
      });
    }
    if (!matched) {
      logPricing(`cabin ${cabin}: no bundle (flight numbers or ${route.origin}→${route.hub}→${route.destination}) — SerpAPI sample`, {
        ...summarizeFlightSearchForLog(json),
      });
    }

    let priceTotal: number | null = null;
    let bookingJson: GoogleFlightsBookingApiResponse | null = null;
    let detailError: string | null = null;

    if (matched && bundle) {
      const token = bundle.booking_token?.trim();
      if (!token) {
        detailError =
          "Matched QR itinerary but SerpAPI bundle had no booking_token; cannot load booking options for airline-direct price.";
        logPricing(`cabin ${cabin}: ${detailError}`);
      } else {
        try {
          ({ json: bookingJson } = await fetchGoogleFlightsBookingOptions({
            apiKey: key,
            bookingToken: token,
            cabin,
          }));
          const bErr = bookingJson.error;
          const bStatus = bookingJson.search_metadata?.status;
          if (bErr || bStatus === "Error") {
            detailError = bErr || "SerpAPI booking_options request failed";
            logPricing(`cabin ${cabin}: booking_options error`, { detailError, bStatus });
          } else {
            const bookingCount = bookingJson.booking_options?.length ?? 0;
            const picked = extractOfficialAirlineDirectPrice(
              bookingJson.booking_options,
              officialSeller,
              currency,
            );
            if (picked) {
              priceTotal = picked.price;
              logPricing(`cabin ${cabin}: airline-direct price`, {
                price: priceTotal,
                bookWith: picked.bookWith,
                bookingOptionsCount: bookingCount,
              });
            } else {
              detailError = `No airline-direct "${officialSeller}" row in booking_options (OTAs only or seller name mismatch).`;
              logPricing(`cabin ${cabin}: ${detailError}`, {
                bookingOptionsCount: bookingCount,
                ...summarizeBookingOptionsForLog(bookingJson.booking_options),
              });
            }
          }
        } catch (e) {
          detailError = e instanceof Error ? e.message : String(e);
          logPricing(`cabin ${cabin}: booking_options threw`, { detailError });
        }
      }
    }

    const qsuiteIndicatorsPresent =
      matched && bundle
        ? qsuiteMarkersPresentForBusiness(cabin, bookingJson, bundle)
        : null;

    const baseErr = matched
      ? null
      : `No itinerary matching QR${nums.first}+QR${nums.second} or ${route.origin}→${route.hub}→${route.destination} in SerpAPI results`;
    const error = [baseErr, detailError].filter(Boolean).join(" ") || null;

    const row: TrackedBundleCabinResult = {
      cabin,
      ok: true,
      matchedBundle: matched,
      priceTotal,
      currency,
      qsuiteIndicatorsPresent,
      flightNumbersSummary: matched && bundle ? formatBundleFlightNumbers(bundle) : null,
      error,
      serpSearchId: json.search_metadata?.id ?? null,
    };

    const p = await persist({
      bundleFirstLegDate,
      cabin: cabinToPrisma(cabin),
      priceTotal,
      currency,
      matchedBundle: matched,
      qsuiteIndicatorsPresent,
      flightNumbersSummary: matched && bundle ? formatBundleFlightNumbers(bundle) : null,
      error,
      serpSearchId: json.search_metadata?.id ?? null,
    });
    row.dbPersisted = p.ok;
    row.dbError = p.error;
    if (p.ok) {
      logPricing(`cabin ${cabin}: row persisted`, { qsuite: row.qsuiteIndicatorsPresent });
    }
    results.push(row);
  }

  logPricing("done", {
    totalMs: Date.now() - tJobStart,
    results: results.map((r) => ({
      cabin: r.cabin,
      matched: r.matchedBundle,
      price: r.priceTotal,
      dbOk: r.dbPersisted,
      err: r.error?.slice(0, 120) ?? null,
      dbErr: r.dbError?.slice(0, 120) ?? null,
    })),
  });

  return { skipped: false, results };
}

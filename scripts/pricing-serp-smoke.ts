/**
 * Local smoke test: SerpAPI Google Flights bundle match + booking_options + Qatar direct price.
 * Usage (do not commit secrets):
 *   set SERPAPI_KEY=... && npx tsx scripts/pricing-serp-smoke.ts
 */
import {
  extractOfficialAirlineDirectPrice,
  fetchGoogleFlightsBookingOptions,
  fetchGoogleFlightsBundle,
  resolveTrackedBundle,
  summarizeFlightSearchForLog,
} from "../src/lib/googleFlightsSerp";
import {
  getTrackedAirportRoute,
  getTrackedFlightNumbers,
  getTrackedOfficialBookWith,
} from "../src/lib/trackedBundleConfig";

async function main() {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) {
    console.error("Missing SERPAPI_KEY in environment.");
    process.exit(1);
  }

  const nums = getTrackedFlightNumbers();
  const route = getTrackedAirportRoute();
  const official = getTrackedOfficialBookWith();
  const currency = process.env.TRACKED_BUNDLE_CURRENCY?.trim() || "EUR";

  for (const cabin of ["ECONOMY", "BUSINESS"] as const) {
    console.log("\n===", cabin, "===");
    const { json, urlUsed } = await fetchGoogleFlightsBundle({
      apiKey: key,
      cabin,
    });
    console.log("search summary:", summarizeFlightSearchForLog(json));
    if (json.error) {
      console.log("SerpAPI error:", json.error);
      continue;
    }
    const resolved = resolveTrackedBundle(json, nums, route);
    const bundle = resolved?.bundle ?? null;
    console.log(
      "matched bundle:",
      bundle ? "yes" : "no",
      resolved?.kind ? `(${resolved.kind})` : "",
      bundle?.price != null ? `list price ${bundle.price}` : "",
    );
    if (!bundle?.booking_token?.trim()) {
      console.log("No booking_token — skip booking_options");
      continue;
    }
    const { json: bj } = await fetchGoogleFlightsBookingOptions({
      apiKey: key,
      bookingToken: bundle.booking_token,
      cabin,
    });
    if (bj.error) {
      console.log("booking_options error:", bj.error);
      continue;
    }
    const picked = extractOfficialAirlineDirectPrice(bj.booking_options, official, currency);
    console.log("Qatar direct (airline row):", picked ?? "none");
    void urlUsed;
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

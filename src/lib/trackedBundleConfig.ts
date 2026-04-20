/**
 * Env-driven defaults for the AMS → DOH → MNL Qatar bundle tracked via SerpAPI.
 *
 * This is **one ticket, one way**, with a **layover in Doha** (~18h): QR274 then QR934.
 * Google Flights / SerpAPI still model it as **two flight segments** with different local dates
 * (AMS→DOH on the departure day, DOH→MNL the next calendar day after the overnight stop).
 * We use SerpAPI `type=3` + `multi_city_json` only to pin those two legs — not a “multi-city holiday”.
 */

export type TrackedBundleLegDates = {
  firstLegIso: string;
  secondLegIso: string;
};

export type TrackedFlightNums = { first: string; second: string };

export function getTrackedBundleLegDates(): TrackedBundleLegDates {
  const first =
    process.env.TRACKED_BUNDLE_FIRST_LEG_DATE?.trim() || process.env.TRACKED_BUNDLE_OUTBOUND_DATE?.trim();
  const second = process.env.TRACKED_BUNDLE_SECOND_LEG_DATE?.trim();
  if (first && second && /^\d{4}-\d{2}-\d{2}$/.test(first) && /^\d{4}-\d{2}-\d{2}$/.test(second)) {
    return { firstLegIso: first, secondLegIso: second };
  }
  // Default: Sunday 11 Oct 2026 AMS→DOH; DOH→MNL next calendar day (matches Google Flights itinerary).
  return { firstLegIso: "2026-10-11", secondLegIso: "2026-10-12" };
}

export function getTrackedFlightNumbers(): TrackedFlightNums {
  const raw = process.env.TRACKED_BUNDLE_FLIGHT_NUMBERS?.trim();
  if (raw) {
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    if (parts.length >= 2) return { first: parts[0]!, second: parts[1]! };
  }
  return { first: "274", second: "934" };
}

/** Google Flights `booking_options[].together.book_with` for airline-direct (not OTA). Default: Qatar Airways. */
export function getTrackedOfficialBookWith(): string {
  return process.env.TRACKED_OFFICIAL_BOOK_WITH?.trim() || "Qatar Airways";
}

/** Passenger count for SerpAPI `adults` (total price for all adults). Default: 2. */
export function getTrackedBundleAdults(): number {
  const raw = process.env.TRACKED_BUNDLE_ADULTS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 2;
  if (!Number.isFinite(n) || n < 1 || n > 9) return 2;
  return n;
}

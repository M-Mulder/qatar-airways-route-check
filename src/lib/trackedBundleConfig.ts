/**
 * Env-driven defaults for the AMS → DOH → MNL Qatar bundle tracked via SerpAPI.
 * First leg: QR274. Second leg: QR934 (overnight in DOH).
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

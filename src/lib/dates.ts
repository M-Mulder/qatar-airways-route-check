import { addDays, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const AMS_TZ = "Europe/Amsterdam";

/** Calendar date YYYY-MM-DD in Amsterdam, offset from today (0 = today, -1 = yesterday). */
export function amsterdamCalendarIso(offsetDays: number): string {
  const nowUtc = new Date();
  const nowAms = toZonedTime(nowUtc, AMS_TZ);
  return format(addDays(nowAms, offsetDays), "yyyy-MM-dd");
}

/** Calendar date YYYY-MM-DD in Amsterdam for "yesterday" (full local day completed before cron). */
export function amsterdamYesterdayIso(): string {
  return amsterdamCalendarIso(-1);
}

/**
 * Yesterday, today, and tomorrow in Europe/Amsterdam (for rolling compare against planned export + FR24).
 */
export function amsterdamThreeDayCompareWindowIso(): [string, string, string] {
  return [amsterdamCalendarIso(-1), amsterdamCalendarIso(0), amsterdamCalendarIso(1)];
}

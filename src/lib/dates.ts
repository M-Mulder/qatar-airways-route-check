import { format, subDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const AMS_TZ = "Europe/Amsterdam";

/** Calendar date YYYY-MM-DD in Amsterdam for "yesterday" (full local day completed before cron). */
export function amsterdamYesterdayIso(): string {
  const nowUtc = new Date();
  const nowAms = toZonedTime(nowUtc, AMS_TZ);
  const y = subDays(nowAms, 1);
  return format(y, "yyyy-MM-dd");
}

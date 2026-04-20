import { getQsuitePriceAlertState } from "@/lib/qsuitePriceAlert";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";

export async function QsuitePriceAlertBar() {
  if (!hasDatabaseUrl()) return null;
  const prisma = getPrisma();
  if (!prisma) return null;

  let active: boolean;
  let observedAt: Date | null;
  try {
    ({ active, observedAt } = await getQsuitePriceAlertState(prisma));
  } catch {
    return null;
  }
  if (!active) return null;

  const when = observedAt
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(observedAt)
    : "";

  return (
    <div
      role="alert"
      className="relative z-30 border-b border-red-700/80 bg-red-600 px-4 py-2.5 text-center text-sm font-medium text-white shadow-[0_8px_32px_rgba(220,38,38,0.35)]"
    >
      <span className="font-semibold tracking-wide">Qsuite itinerary changed</span>
      <span className="mx-2 opacity-90">—</span>
      <span className="opacity-95">
        The latest Google Flights (SerpAPI) result for this tracked business bundle no longer lists the suite
        amenity (e.g. &quot;Individuele suite&quot;). Verify the booking before relying on Qsuite.
      </span>
      {when ? (
        <span className="mt-1 block text-xs font-normal opacity-90">Last check (UTC): {when}</span>
      ) : null}
    </div>
  );
}

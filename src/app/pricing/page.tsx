import {
  getTrackedBundleAdults,
  getTrackedBundleLegDates,
  getTrackedFlightNumbers,
} from "@/lib/trackedBundleConfig";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";
import { PricingChart, type PricingChartRow } from "./PricingChart";
import Link from "next/link";

export const dynamic = "force-dynamic";

function aggregateDaily(rows: { cabin: string; observedAt: Date; priceTotal: number | null; matchedBundle: boolean }[]) {
  const byDay = new Map<string, { economy: number | null; business: number | null }>();

  for (const r of rows) {
    if (!r.matchedBundle || r.priceTotal == null) continue;
    const day = r.observedAt.toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { economy: null, business: null };
    if (r.cabin === "ECONOMY") cur.economy = r.priceTotal;
    if (r.cabin === "BUSINESS") cur.business = r.priceTotal;
    byDay.set(day, cur);
  }

  const sortedDays = [...byDay.keys()].sort();
  const out: PricingChartRow[] = sortedDays.map((day) => {
    const v = byDay.get(day)!;
    return { day, economy: v.economy, business: v.business };
  });
  return out;
}

export default async function PricingPage() {
  const legs = getTrackedBundleLegDates();
  const nums = getTrackedFlightNumbers();
  const adults = getTrackedBundleAdults();
  const bundleFirstLegDate = new Date(`${legs.firstLegIso}T12:00:00.000Z`);

  let chartRows: PricingChartRow[] = [];
  let dbError: string | null = null;

  if (!hasDatabaseUrl()) {
    dbError = "Set DATABASE_URL to load pricing history.";
  } else {
    const prisma = getPrisma();
    if (!prisma) {
      dbError = "Database client unavailable.";
    } else {
      try {
        const snaps = await prisma.trackedBundlePriceSnapshot.findMany({
          where: { bundleFirstLegDate },
          orderBy: { observedAt: "asc" },
          select: {
            cabin: true,
            observedAt: true,
            priceTotal: true,
            matchedBundle: true,
          },
        });
        chartRows = aggregateDaily(snaps);
      } catch {
        dbError =
          "Pricing table missing or unavailable. Run migrations (e.g. `npm run db:migrate` or `npm run db:apply-tracked-bundle-migration`) then `npm run db:generate`.";
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <div className="mb-8 max-w-3xl ops-reveal">
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-[var(--ops-muted)]">Google Flights</p>
        <h1 className="ops-display text-3xl text-[var(--ops-fg)] md:text-4xl">Tracked bundle pricing</h1>
        <p className="mt-3 text-[var(--ops-muted)] leading-relaxed">
          Daily SerpAPI snapshots for Qatar Airways{" "}
          <span className="text-[var(--ops-fg)]">
            AMS→DOH ({legs.firstLegIso}, QR{nums.first}) then DOH→MNL ({legs.secondLegIso}, QR{nums.second})
          </span>
          . Stored prices are the airline-direct total from Google Flights booking options (
          <span className="text-[var(--ops-fg)]">
            {adults} adult{adults === 1 ? "" : "s"}, EUR
          </span>
          ).
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/pricing/qr274-calendar"
            className="rounded-lg border border-[var(--ops-line)] bg-[var(--ops-card)] px-3 py-2 text-sm text-[var(--ops-fg)] hover:bg-[color-mix(in_oklab,var(--ops-card),black_6%)]"
          >
            QR274 business calendar (next month)
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ops-line)] bg-[var(--ops-card)] p-4 shadow-[var(--ops-shadow)] md:p-6">
        {dbError ? (
          <p className="text-[var(--ops-rose)]">{dbError}</p>
        ) : (
          <PricingChart rows={chartRows} />
        )}
      </div>
    </div>
  );
}

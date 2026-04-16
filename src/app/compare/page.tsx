import type { DailyCompare } from "@/generated/prisma";
import { fr24FlightPath } from "@/lib/config";
import { overallCompareMatch } from "@/lib/compareExplain";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";
import type { PlannedRow } from "@/lib/plannedCsv";
import { loadPlannedRowsFromDatabase } from "@/lib/plannedFromDb";
import { CompareBriefingPopover } from "./CompareBriefingPopover";
import { PlannedExportTable } from "./PlannedExportTable";
import { RegistrationAirfleetsPopover } from "./RegistrationAirfleetsPopover";

export const dynamic = "force-dynamic";

function badge(match: boolean | null) {
  if (match === true) return "ops-badge ops-badge-ok";
  if (match === false) return "ops-badge ops-badge-warn";
  return "ops-badge ops-badge-muted";
}

function label(match: boolean | null) {
  if (match === true) return "Aligned";
  if (match === false) return "Not aligned";
  return "Unclear";
}

export default async function ComparePage() {
  let rows: DailyCompare[] = [];
  let dbError: string | null = null;

  let plannedRows: PlannedRow[] = [];
  let plannedError: string | null = null;

  const prisma = hasDatabaseUrl() ? getPrisma() : null;

  if (!hasDatabaseUrl()) {
    plannedError =
      "Connect a database (set DATABASE_URL) to load your schedule from the app.";
    dbError = "Database unavailable.";
  } else if (!prisma) {
    const msg =
      "DATABASE_URL is set but Prisma could not be initialized. Check the connection string and run `npx prisma generate`.";
    plannedError = msg;
    dbError = msg;
  } else {
    try {
      plannedRows = await loadPlannedRowsFromDatabase();
      if (plannedRows.length === 0) {
        plannedError =
          "No schedule in the database yet. Import your CSV with: npm run db:seed-planned <path-to-export.csv>";
      }
    } catch (e) {
      plannedError = e instanceof Error ? e.message : String(e);
    }

    try {
      rows = await prisma.dailyCompare.findMany({
        where: { OR: [{ matchQsuite: true }, { matchQsuite: false }] },
        orderBy: [{ compareDate: "asc" }, { flight: "asc" }, { routeKey: "asc" }],
        take: 5000,
      });
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 md:space-y-14 md:px-6 md:py-14">
      <div className="ops-reveal">
        <h1 className="ops-display text-3xl text-[var(--ops-fg)] md:text-4xl">
          Your booking vs what flew
        </h1>
      </div>

      {plannedError ? (
        <div className="ops-reveal ops-reveal-d1 ops-alert ops-alert-error">
          <p className="font-semibold text-white">Schedule</p>
          <p className="mt-1 opacity-95">{plannedError}</p>
        </div>
      ) : null}

      <section className="ops-reveal ops-reveal-d1 space-y-4">
        <h2 className="ops-display text-xl text-[var(--ops-fg)]">Route check results</h2>
        <p className="text-sm text-[var(--ops-subtle)]">
          Where your published schedule lines up with what actually operated. Hover a{" "}
          <span className="text-[var(--ops-muted)]">registration</span> for stored aircraft details when the daily
          job has saved them.
        </p>
        {dbError ? (
          <div className="ops-alert ops-alert-warn">
            <p className="font-semibold text-[var(--ops-fg)]">{dbError}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="max-w-2xl space-y-3">
            <p className="text-sm text-[var(--ops-muted)]">No route check results yet.</p>
            {!plannedError && plannedRows.length > 0 ? (
              <p className="text-xs leading-relaxed text-[var(--ops-subtle)]">
                A row appears here only when the daily job can match that flight for the date and route{" "}
                <em>and</em> confirm both{" "}
                <span className="text-[var(--ops-muted)]">Qsuite</span> (airline data vs the aircraft registration)
                and{" "}
                <span className="text-[var(--ops-muted)]">aircraft type</span> (your schedule vs what operated).
                If comparison data is missing, blocked, or the aircraft line does not match your schedule, nothing
                is saved here—the upcoming flights table below still reflects your saved schedule.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="ops-panel overflow-x-auto p-1">
            <table className="ops-table min-w-[800px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Flight</th>
                  <th>Scheduled aircraft</th>
                  <th>Operated aircraft</th>
                  <th>Qsuite (airline)</th>
                  <th>Registration</th>
                  <th>Qsuite (aircraft)</th>
                  <th>Status</th>
                  <th>Link</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const overall = overallCompareMatch({
                    plannedEquipment: r.plannedEquipment,
                    actualEquipment: r.actualEquipment,
                    plannedQsuiteApi: r.plannedQsuiteApi,
                    actualQsuiteFromTail: r.actualQsuiteFromTail,
                    actualAircraftCell: r.actualAircraftCell,
                    matchQsuite: r.matchQsuite,
                    matchEquipment: r.matchEquipment,
                    actualRegistration: r.actualRegistration,
                  });
                  return (
                    <tr key={r.id}>
                      <td className="ops-table-mono text-[var(--ops-fg)]">{r.compareDate.toISOString().slice(0, 10)}</td>
                      <td className="text-[var(--ops-fg)]">{r.routeKey}</td>
                      <td className="font-semibold tracking-tight text-[var(--ops-copper)]">{r.flight}</td>
                      <td className="text-[var(--ops-muted)]">{r.plannedEquipment ?? "—"}</td>
                      <td className="text-[var(--ops-muted)]">{r.actualEquipment ?? "—"}</td>
                      <td className="text-[var(--ops-muted)]">
                        {r.plannedQsuiteApi === null ? "—" : r.plannedQsuiteApi ? "Yes" : "No"}
                      </td>
                      <td className="align-middle">
                        <RegistrationAirfleetsPopover
                          registration={r.actualRegistration}
                          payload={r.airfleetsPayload}
                        />
                      </td>
                      <td className="text-[var(--ops-muted)]">
                        {r.actualQsuiteFromTail === null ? "—" : r.actualQsuiteFromTail ? "Yes" : "No"}
                      </td>
                      <td className="relative align-middle">
                        <CompareBriefingPopover
                          input={{
                            plannedEquipment: r.plannedEquipment,
                            actualEquipment: r.actualEquipment,
                            plannedQsuiteApi: r.plannedQsuiteApi,
                            actualQsuiteFromTail: r.actualQsuiteFromTail,
                            actualAircraftCell: r.actualAircraftCell,
                            matchQsuite: r.matchQsuite,
                            matchEquipment: r.matchEquipment,
                            actualRegistration: r.actualRegistration,
                          }}
                          badgeLabel={label(overall)}
                          badgeClassName={badge(overall)}
                        />
                      </td>
                      <td>
                        <a
                          className="ops-link text-xs font-semibold"
                          href={fr24FlightPath(r.flight)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open flight ↗
                        </a>
                      </td>
                      <td
                        className="max-w-[200px] truncate text-xs text-[var(--ops-rose)]"
                        title={r.fr24Error ?? ""}
                      >
                        {r.fr24Error ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!plannedError && plannedRows.length > 0 ? (
        <section id="upcoming-flights" className="ops-reveal ops-reveal-d2 space-y-4 scroll-mt-24">
          <h2 className="ops-display text-xl text-[var(--ops-fg)]">Upcoming flights</h2>
          <p className="text-sm text-[var(--ops-subtle)]">
            From your saved schedule. Today&apos;s departures are highlighted and scrolled into view.
          </p>
          <PlannedExportTable rows={plannedRows} />
        </section>
      ) : null}
    </div>
  );
}

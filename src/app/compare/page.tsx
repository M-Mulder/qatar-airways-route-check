import Link from "next/link";
import type { DailyCompare } from "@prisma/client";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";
import { fr24FlightPath } from "@/lib/config";

export const dynamic = "force-dynamic";

function badge(match: boolean | null) {
  if (match === true) return "bg-emerald-100 text-emerald-900";
  if (match === false) return "bg-amber-100 text-amber-950";
  return "bg-zinc-100 text-zinc-700";
}

function label(match: boolean | null) {
  if (match === true) return "Match";
  if (match === false) return "Mismatch";
  return "N/A";
}

export default async function ComparePage() {
  let rows: DailyCompare[] = [];
  let dbError: string | null = null;

  if (!hasDatabaseUrl()) {
    dbError =
      "DATABASE_URL is not set. For local dev, copy env.example to .env.local and add your Postgres connection string.";
  } else {
    const prisma = getPrisma()!;
    try {
      rows = await prisma.dailyCompare.findMany({
        orderBy: [{ compareDate: "desc" }, { flight: "asc" }, { routeKey: "asc" }],
        take: 150,
      });
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Planned vs actual</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Planned from Qatar CSV snapshot (<code className="rounded bg-zinc-100 px-1">PLANNED_DATA_URL</code>).
            Actual tail from Flightradar24 history pages; Qsuite inferred from the static tail list in{" "}
            <code className="rounded bg-zinc-100 px-1">data/qsuite-tails.json</code>.
          </p>
        </div>
        <Link href="/" className="text-sm font-medium text-violet-700 hover:underline">
          About
        </Link>
      </div>

      {dbError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Database unavailable</p>
          <p className="mt-1 text-amber-900/90">{dbError}</p>
          <p className="mt-2 text-amber-900/80">
            Local: <code className="rounded bg-white/60 px-1">.env.local</code> with <code className="rounded bg-white/60 px-1">DATABASE_URL</code>. Vercel: set the same in Project Settings → Environment Variables. Apply schema with{" "}
            <code className="rounded bg-white/60 px-1">scripts/create-daily-compare-only.sql</code> or{" "}
            <code className="rounded bg-white/60 px-1">npx prisma migrate deploy</code> on that database.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No rows yet. After deploy, wait for the daily cron or call{" "}
          <code className="rounded bg-zinc-100 px-1">GET /api/cron/compare</code> with Bearer{" "}
          <code className="rounded bg-zinc-100 px-1">CRON_SECRET</code>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Flight</th>
                <th className="px-3 py-2">Planned equip.</th>
                <th className="px-3 py-2">API Qsuite</th>
                <th className="px-3 py-2">Tail</th>
                <th className="px-3 py-2">Tail Qsuite</th>
                <th className="px-3 py-2">Compare</th>
                <th className="px-3 py-2">FR24</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/80">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-800">
                    {r.compareDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-zinc-800">{r.routeKey}</td>
                  <td className="px-3 py-2 font-medium text-zinc-900">{r.flight}</td>
                  <td className="px-3 py-2 text-zinc-700">{r.plannedEquipment ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.plannedQsuiteApi === null ? "—" : r.plannedQsuiteApi ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.actualRegistration ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.actualQsuiteFromTail === null ? "—" : r.actualQsuiteFromTail ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(r.matchQsuite)}`}>
                      {label(r.matchQsuite)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <a
                      className="text-violet-700 hover:underline"
                      href={fr24FlightPath(r.flight)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-amber-800" title={r.fr24Error ?? ""}>
                    {r.fr24Error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

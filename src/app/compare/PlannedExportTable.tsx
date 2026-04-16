"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlannedRow } from "@/lib/plannedCsv";
import { departureDateKey } from "@/lib/plannedCsv";
import { QsuiteQMark } from "./QsuiteQMark";

function localCalendarDateIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rowDepartureDateIso(r: PlannedRow): string | null {
  return departureDateKey(r.departure_local);
}

function isRowForToday(r: PlannedRow, todayIso: string): boolean {
  const dep = rowDepartureDateIso(r);
  if (dep === todayIso) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.query_date) && r.query_date === todayIso && !dep) return true;
  return false;
}

export type PlannedExportSortKey =
  | "query_date"
  | "flight_number"
  | "route"
  | "departure_local"
  | "type"
  | "vehicle_code"
  | "qsuite";

type SortDir = "asc" | "desc";

function routeLabel(r: PlannedRow): string {
  return `${r.origin}–${r.destination}`;
}

function typeLabel(r: PlannedRow): string {
  return (r.vehicle_short || r.vehicle_name || "").trim() || "—";
}

/** Lowercase aircraft label for display, e.g. `a359`; matches sort key casing via typeLabel. */
function aircraftDisplayText(r: PlannedRow): string {
  const t = typeLabel(r);
  return t === "—" ? t : t.toLowerCase();
}

function qsuiteRank(v: boolean | null): number {
  if (v === false) return 0;
  if (v === null) return 1;
  return 2;
}

/** Stable chronological tiebreak (always ascending by operational time, then flight/route). */
function tiebreakStable(a: PlannedRow, b: PlannedRow): number {
  return (
    a.departure_local.localeCompare(b.departure_local) ||
    a.flight_number.localeCompare(b.flight_number) ||
    routeLabel(a).localeCompare(routeLabel(b)) ||
    a.query_date.localeCompare(b.query_date)
  );
}

function comparePlanned(a: PlannedRow, b: PlannedRow, key: PlannedExportSortKey, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case "query_date":
      cmp = a.query_date.localeCompare(b.query_date);
      break;
    case "flight_number":
      cmp = a.flight_number.localeCompare(b.flight_number);
      break;
    case "route":
      cmp = routeLabel(a).localeCompare(routeLabel(b));
      break;
    case "departure_local":
      cmp = a.departure_local.localeCompare(b.departure_local);
      break;
    case "type":
      cmp = typeLabel(a).localeCompare(typeLabel(b));
      break;
    case "vehicle_code":
      cmp = (a.vehicle_code || "").localeCompare(b.vehicle_code || "");
      break;
    case "qsuite":
      cmp = qsuiteRank(a.qsuite_equipped) - qsuiteRank(b.qsuite_equipped);
      break;
    default:
      cmp = 0;
  }
  if (cmp !== 0) return cmp * sign;
  return tiebreakStable(a, b);
}

function sortRows(rows: PlannedRow[], key: PlannedExportSortKey, dir: SortDir): PlannedRow[] {
  return [...rows].sort((a, b) => comparePlanned(a, b, key, dir));
}

function SortTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: PlannedExportSortKey;
  activeKey: PlannedExportSortKey;
  dir: SortDir;
  onSort: (k: PlannedExportSortKey) => void;
}) {
  const active = activeKey === sortKey;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group flex w-full items-center gap-1.5 px-1 py-2 text-left transition-colors ${
          active ? "text-[var(--ops-cyan)]" : "text-[var(--ops-muted)] hover:text-[var(--ops-fg)]"
        }`}
      >
        <span>{label}</span>
        <span className="font-mono text-[0.55rem] font-normal opacity-70" aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function PlannedExportTable({ rows }: { rows: PlannedRow[] }) {
  const [sortKey, setSortKey] = useState<PlannedExportSortKey>("departure_local");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const firstTodayRowRef = useRef<HTMLTableRowElement | null>(null);

  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  const todayIso = useMemo(() => localCalendarDateIso(), []);
  const firstTodayIndex = useMemo(() => {
    return sorted.findIndex((r) => isRowForToday(r, todayIso));
  }, [sorted, todayIso]);

  useEffect(() => {
    if (firstTodayIndex < 0) return;
    const row = firstTodayRowRef.current;
    if (!row) return;
    const section = document.getElementById("upcoming-flights");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = window.setTimeout(() => {
      row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, 450);
    return () => window.clearTimeout(t);
  }, [firstTodayIndex, sorted]);

  function handleSort(key: PlannedExportSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="ops-panel ops-scroll max-h-[min(70vh,720px)] overflow-auto p-1">
      <table className="ops-table min-w-[640px] text-xs">
        <thead className="bg-[var(--ops-elevated)]">
          <tr>
            <SortTh label="Snapshot date" sortKey="query_date" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Flight" sortKey="flight_number" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Route" sortKey="route" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh
              label="Departure (local)"
              sortKey="departure_local"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
            />
            <SortTh label="Aircraft" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Code" sortKey="vehicle_code" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Qsuite (airline)" sortKey="qsuite" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={`${r.query_date}-${r.flight_number}-${r.origin}-${r.destination}-${r.departure_local}-${i}`}
              ref={
                firstTodayIndex === i
                  ? (el) => {
                      firstTodayRowRef.current = el;
                    }
                  : undefined
              }
              className={
                isRowForToday(r, todayIso)
                  ? "bg-[var(--ops-cyan)]/10 ring-1 ring-inset ring-[var(--ops-cyan)]/35"
                  : undefined
              }
              aria-current={firstTodayIndex === i ? "true" : undefined}
            >
              <td className="ops-table-mono">{r.query_date}</td>
              <td className="font-semibold text-[var(--ops-copper)]">{r.flight_number}</td>
              <td className="text-[var(--ops-muted)]">
                {r.origin}–{r.destination}
              </td>
              <td className="ops-table-mono text-[var(--ops-fg)]">{r.departure_local}</td>
              <td className="text-[var(--ops-muted)]">
                <span className="inline-flex flex-wrap items-baseline gap-x-1">
                  <span>{aircraftDisplayText(r)}</span>
                  {r.qsuite_equipped === true ? (
                    <span
                      className="inline-flex items-center gap-0 text-[var(--ops-subtle)]"
                      title="Scheduled Qsuite"
                    >
                      <span>(</span>
                      <QsuiteQMark />
                      <span>)</span>
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="ops-table-mono">{r.vehicle_code || "—"}</td>
              <td className="text-[var(--ops-muted)]">
                {r.qsuite_equipped === null ? "—" : r.qsuite_equipped ? "Yes" : "No"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

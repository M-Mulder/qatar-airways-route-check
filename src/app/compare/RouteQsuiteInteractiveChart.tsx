"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type QsuiteLegDatum = {
  id: string;
  compareDate: string;
  routeKey: string;
  flight: string;
  plannedQsuiteApi: boolean | null;
  actualQsuiteFromTail: boolean | null;
  matchQsuite: boolean | null;
  actualRegistration: string | null;
};

type ChartRow = QsuiteLegDatum & {
  plannedY: number;
  tailY: number;
};

const COL = {
  plannedYes: "#5eead4",
  plannedNo: "rgba(251, 113, 133, 0.55)",
  plannedUnknown: "rgba(122, 143, 163, 0.72)",
  tailYes: "#4ade80",
  tailNo: "#fb7185",
  tailUnknown: "rgba(122, 143, 163, 0.78)",
} as const;

function triY(v: boolean | null): number {
  if (v === true) return 1;
  if (v === false) return 0;
  return 0.5;
}

function plannedFill(v: boolean | null): string {
  if (v === true) return COL.plannedYes;
  if (v === false) return COL.plannedNo;
  return COL.plannedUnknown;
}

function tailFill(v: boolean | null): string {
  if (v === true) return COL.tailYes;
  if (v === false) return COL.tailNo;
  return COL.tailUnknown;
}

function yn(v: boolean | null): string {
  if (v === null) return "—";
  return v ? "Yes" : "No";
}

function matchPhrase(v: boolean | null): string {
  if (v === true) return "Match";
  if (v === false) return "Mismatch";
  return "—";
}

function QsuiteTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartRow }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="rounded-lg border border-[rgba(94,234,212,0.22)] bg-[rgba(6,8,12,0.96)] px-3 py-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-sm">
      <p className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-[var(--ops-cyan-dim)]">
        Leg snapshot
      </p>
      <p className="mt-1.5 font-mono text-xs text-[var(--ops-fg)]">
        <span className="text-[var(--ops-copper)]">{p.compareDate}</span>{" "}
        <span className="text-[var(--ops-muted)]">·</span>{" "}
        <span className="font-semibold text-[var(--ops-copper)]">{p.flight}</span>
      </p>
      <dl className="mt-2 space-y-1 font-mono text-[0.72rem] leading-relaxed text-[var(--ops-muted)]">
        <div className="flex justify-between gap-6">
          <dt>Qsuite (airline)</dt>
          <dd className="text-[var(--ops-fg)]">{yn(p.plannedQsuiteApi)}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Qsuite-capable tail</dt>
          <dd className="text-[var(--ops-fg)]">{yn(p.actualQsuiteFromTail)}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Stored Qsuite compare</dt>
          <dd className={p.matchQsuite === false ? "text-[var(--ops-rose)]" : "text-[var(--ops-fg)]"}>
            {matchPhrase(p.matchQsuite)}
          </dd>
        </div>
        {(p.actualRegistration ?? "").trim() ? (
          <div className="flex justify-between gap-6 border-t border-[var(--ops-line)] pt-1.5">
            <dt>Registration</dt>
            <dd className="text-[var(--ops-cyan)]">{(p.actualRegistration ?? "").trim().toUpperCase()}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-2 border-t border-[var(--ops-line)] pt-2 text-[0.62rem] leading-snug text-[var(--ops-subtle)]">
        Bars are height-coded: bottom = <span className="text-[var(--ops-rose)]">No</span>, middle = unknown, top ={" "}
        <span className="text-[var(--ops-mint)]">Yes</span>.
      </p>
    </div>
  );
}

function OpsRouteTick(props: {
  x: number | string;
  y: number | string;
  payload: { value: string };
  chartRows: ChartRow[];
}) {
  const { payload, chartRows } = props;
  const x = Number(props.x);
  const y = Number(props.y);
  const row = chartRows.find((r) => r.id === payload.value);
  if (!row) {
    return (
      <text x={x} y={y} dy={12} fill="#7a8fa3" fontSize={9} textAnchor="end" transform={`rotate(-32 ${x} ${y})`}>
        {payload.value}
      </text>
    );
  }
  return (
    <text x={x} y={y} dy={10} fill="#7a8fa3" fontSize={9} textAnchor="end" transform={`rotate(-34 ${x} ${y})`}>
      <tspan fill="#7a8fa3">{row.compareDate.slice(5)}</tspan>
      <tspan fill="#e8a54b" dx={4}>
        {row.flight}
      </tspan>
    </text>
  );
}

export function RouteQsuiteInteractiveChart({ legs }: { legs: QsuiteLegDatum[] }) {
  const routeOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of legs) {
      const k = l.routeKey.trim() || "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([routeKey]) => routeKey);
  }, [legs]);

  const defaultRoute = routeOptions[0] ?? "";
  const [routeKey, setRouteKey] = useState(defaultRoute);

  const resolvedRouteKey = useMemo(() => {
    if (!routeOptions.length) return "";
    return routeOptions.includes(routeKey) ? routeKey : (routeOptions[0] ?? "");
  }, [routeKey, routeOptions]);

  const chartData = useMemo((): ChartRow[] => {
    const subset = legs.filter((l) => (l.routeKey.trim() || "—") === resolvedRouteKey);
    subset.sort(
      (a, b) => a.compareDate.localeCompare(b.compareDate) || a.flight.localeCompare(b.flight),
    );
    return subset.map((l) => ({
      ...l,
      plannedY: triY(l.plannedQsuiteApi),
      tailY: triY(l.actualQsuiteFromTail),
    }));
  }, [legs, resolvedRouteKey]);

  if (!routeOptions.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block max-w-md space-y-1.5">
          <span className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-[var(--ops-muted)]">
            Route
          </span>
          <select
            value={resolvedRouteKey}
            onChange={(e) => setRouteKey(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-[var(--ops-line-strong)] bg-[var(--ops-void)] px-3 py-2.5 font-mono text-xs text-[var(--ops-fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-[border-color,box-shadow] focus:border-[rgba(94,234,212,0.45)] focus:ring-2 focus:ring-[rgba(94,234,212,0.12)]"
          >
            {routeOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <p className="max-w-sm text-[0.65rem] leading-relaxed text-[var(--ops-subtle)]">
          Hover any pair of bars for that leg&apos;s date, flight, scheduled Qsuite vs tail list, and registration.
          Drag the brush strip to zoom the window when you have many flights.
        </p>
      </div>

      {chartData.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--ops-line)] bg-[var(--ops-void)]/60 px-4 py-6 text-center text-sm text-[var(--ops-muted)]">
          No saved checks for this route yet.
        </p>
      ) : (
        <div className="h-[min(28rem,calc(100vh-12rem))] min-h-[320px] w-full rounded-xl border border-[var(--ops-line)] bg-[rgba(3,5,8,0.45)] p-2 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
              barGap={4}
              barCategoryGap="14%"
            >
              <CartesianGrid strokeDasharray="4 6" stroke="rgba(94, 234, 212, 0.07)" vertical={false} />
              <XAxis
                dataKey="id"
                type="category"
                interval={chartData.length > 20 ? "preserveStartEnd" : 0}
                height={58}
                tick={(props) => <OpsRouteTick {...props} chartRows={chartData} />}
                stroke="rgba(122, 143, 163, 0.35)"
                tickLine={{ stroke: "rgba(122, 143, 163, 0.25)" }}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.5, 1]}
                tickFormatter={(v) => (v === 1 ? "Yes" : v === 0 ? "No" : "?")}
                width={36}
                stroke="rgba(122, 143, 163, 0.35)"
                tick={{ fill: "#7a8fa3", fontSize: 10, fontFamily: "var(--font-jetbrains), ui-monospace, monospace" }}
              />
              <Tooltip
                cursor={{ fill: "rgba(94, 234, 212, 0.06)" }}
                content={<QsuiteTooltip />}
                wrapperStyle={{ outline: "none" }}
              />
              <Legend
                wrapperStyle={{ fontFamily: "var(--font-jetbrains), ui-monospace, monospace", fontSize: "11px" }}
                formatter={(value) => (
                  <span className="text-[var(--ops-muted)]">{String(value)}</span>
                )}
              />
              <Bar dataKey="plannedY" name="Qsuite (airline)" radius={[5, 5, 0, 0]} maxBarSize={26}>
                {chartData.map((entry, i) => (
                  <Cell key={`p-${entry.id}-${i}`} fill={plannedFill(entry.plannedQsuiteApi)} stroke="rgba(0,0,0,0.35)" strokeWidth={0.5} />
                ))}
              </Bar>
              <Bar dataKey="tailY" name="Qsuite-capable tail" radius={[5, 5, 0, 0]} maxBarSize={26}>
                {chartData.map((entry, i) => (
                  <Cell key={`t-${entry.id}-${i}`} fill={tailFill(entry.actualQsuiteFromTail)} stroke="rgba(0,0,0,0.35)" strokeWidth={0.5} />
                ))}
              </Bar>
              <Brush
                dataKey="id"
                height={22}
                stroke="rgba(94, 234, 212, 0.35)"
                fill="rgba(17, 24, 34, 0.9)"
                travellerWidth={8}
                tickFormatter={() => ""}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

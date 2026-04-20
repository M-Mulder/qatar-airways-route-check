"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type PricingChartRow = {
  day: string;
  economy: number | null;
  business: number | null;
};

export function PricingChart({ rows }: { rows: PricingChartRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[var(--ops-muted)]">
        No snapshots yet. After the cron runs with <code className="text-[var(--ops-cyan)]">SERPAPI_KEY</code>, daily
        points appear here.
      </p>
    );
  }

  return (
    <div className="h-[min(28rem,70vh)] w-full min-h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(94, 234, 212, 0.08)" strokeDasharray="3 6" />
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--ops-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--ops-line-strong)" }}
          />
          <YAxis
            tick={{ fill: "var(--ops-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--ops-line-strong)" }}
            tickFormatter={(v) => `€${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--ops-card)",
              border: "1px solid var(--ops-line-strong)",
              borderRadius: "8px",
              color: "var(--ops-fg)",
            }}
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value);
              const label = name === "economy" ? "Economy" : "Business";
              return [Number.isFinite(n) ? `€${n.toLocaleString("nl-NL")}` : "—", label];
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="economy"
            name="economy"
            stroke="var(--ops-cyan)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--ops-cyan)" }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="business"
            name="business"
            stroke="var(--ops-copper)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--ops-copper)" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

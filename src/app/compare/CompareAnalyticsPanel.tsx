import type { CompareAnalytics } from "@/lib/compareAnalytics";
import { pct } from "@/lib/compareAnalytics";

type Props = {
  analytics: CompareAnalytics;
};

function BarRow({
  label,
  segments,
}: {
  label: string;
  segments: Array<{ key: string; value: number; className: string }>;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-[var(--ops-muted)]">{label}</p>
        <p className="text-xs text-[var(--ops-subtle)]">No data in this bucket yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-[var(--ops-muted)]">{label}</p>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--ops-line)]"
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.key} ${pct(s.value, total)}%`).join(", ")}`}
      >
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.key}
              className={`${s.className} min-w-0 transition-[width] duration-500`}
              style={{ width: `${pct(s.value, total)}%` }}
              title={`${s.key}: ${s.value} (${pct(s.value, total)}%)`}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.65rem] text-[var(--ops-subtle)]">
        {segments.map((s) => (
          <li key={s.key}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full align-middle ${s.className}`} /> {s.key}{" "}
            <span className="font-mono text-[var(--ops-fg)]">{pct(s.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompareAnalyticsPanel({ analytics: a }: Props) {
  if (a.total === 0) return null;

  const tailKnown = a.tailQsuiteYes + a.tailQsuiteNo;
  const qsuiteKnown = a.qsuiteMatch + a.qsuiteMismatch;
  const equipKnown = a.equipmentMatch + a.equipmentMismatch;
  const maxDayTotal = Math.max(1, ...a.byDate.map((d) => d.total));
  const barH = 72;

  return (
    <div className="ops-panel mt-6 space-y-6 border border-[var(--ops-line-strong)] p-4 md:p-6">
      <div>
        <h3 className="ops-display text-lg text-[var(--ops-fg)]">At a glance</h3>
        <p className="mt-1 text-xs text-[var(--ops-subtle)]">
          Totals from every saved route check in the table above ({a.total} leg{a.total === 1 ? "" : "s"}).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--ops-line)] bg-[var(--ops-card)]/80 px-3 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--ops-muted)]">
            Fully aligned
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[var(--ops-mint)]">{a.overallAligned}</p>
          <p className="text-xs text-[var(--ops-subtle)]">{pct(a.overallAligned, a.total)}% of checks</p>
        </div>
        <div className="rounded-xl border border-[var(--ops-line)] bg-[var(--ops-card)]/80 px-3 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--ops-muted)]">
            Not aligned
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[var(--ops-rose)]">{a.overallNotAligned}</p>
          <p className="text-xs text-[var(--ops-subtle)]">{pct(a.overallNotAligned, a.total)}% of checks</p>
        </div>
        <div className="rounded-xl border border-[var(--ops-line)] bg-[var(--ops-card)]/80 px-3 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--ops-muted)]">
            Qsuite match
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[var(--ops-cyan)]">{a.qsuiteMatch}</p>
          <p className="text-xs text-[var(--ops-subtle)]">
            {qsuiteKnown ? `${pct(a.qsuiteMatch, qsuiteKnown)}% of decisive Qsuite rows` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--ops-line)] bg-[var(--ops-card)]/80 px-3 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--ops-muted)]">
            Aircraft match
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-[var(--ops-copper)]">{a.equipmentMatch}</p>
          <p className="text-xs text-[var(--ops-subtle)]">
            {equipKnown ? `${pct(a.equipmentMatch, equipKnown)}% where type was compared` : "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 border-t border-[var(--ops-line)] pt-6 md:grid-cols-2">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--ops-fg)]">Qsuite alignment</p>
          <BarRow
            label="Schedule vs tail list (stored match flag)"
            segments={[
              { key: "Match", value: a.qsuiteMatch, className: "bg-[var(--ops-mint)]" },
              { key: "Mismatch", value: a.qsuiteMismatch, className: "bg-[var(--ops-rose)]" },
              { key: "Unknown", value: a.qsuiteUnknown, className: "bg-[var(--ops-muted)]" },
            ]}
          />
          <BarRow
            label="Operated tail in Qsuite-capable list"
            segments={[
              { key: "Yes", value: a.tailQsuiteYes, className: "bg-[var(--ops-cyan)]" },
              { key: "No", value: a.tailQsuiteNo, className: "bg-[var(--ops-amber)]" },
              { key: "Unknown", value: a.tailQsuiteUnknown, className: "bg-[var(--ops-muted)]" },
            ]}
          />
          <p className="text-xs leading-relaxed text-[var(--ops-subtle)]">
            When the tail is known, <span className="text-[var(--ops-fg)]">{pct(a.tailQsuiteYes, tailKnown)}%</span>{" "}
            of legs operated with a Qsuite-capable registration (tail list only—not a cabin guarantee).
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--ops-fg)]">Aircraft family & overall</p>
          <BarRow
            label="Equipment match (schedule vs operated type)"
            segments={[
              { key: "Match", value: a.equipmentMatch, className: "bg-[var(--ops-mint)]" },
              { key: "Mismatch", value: a.equipmentMismatch, className: "bg-[var(--ops-rose)]" },
              { key: "Not stored", value: a.equipmentUnknown, className: "bg-[var(--ops-muted)]" },
            ]}
          />
          <BarRow
            label="Overall status badge (Qsuite + equipment when both stored)"
            segments={[
              { key: "Aligned", value: a.overallAligned, className: "bg-[var(--ops-mint)]" },
              { key: "Not aligned", value: a.overallNotAligned, className: "bg-[var(--ops-rose)]" },
              { key: "Unclear", value: a.overallUnclear, className: "bg-[var(--ops-muted)]" },
            ]}
          />
        </div>
      </div>

      {a.byDate.length > 0 ? (
        <div className="border-t border-[var(--ops-line)] pt-6">
          <p className="text-sm font-semibold text-[var(--ops-fg)]">Fully aligned share by departure date</p>
          <p className="mt-1 text-xs text-[var(--ops-subtle)]">
            Column height scales with how many checks that day; mint (from bottom) = fully aligned share, rose =
            rest.
          </p>
          <div
            className="mt-4 flex items-end gap-1.5 overflow-x-auto pb-1 pt-2"
            style={{ minHeight: barH + 28 }}
            role="list"
          >
            {a.byDate.map((d) => {
              const colH = Math.max(10, Math.round((d.total / maxDayTotal) * barH));
              const alignPct = d.total ? d.aligned / d.total : 0;
              return (
                <div key={d.date} className="flex shrink-0 flex-col items-center gap-1" role="listitem">
                  <div
                    className="relative w-7 overflow-hidden rounded-t-md bg-[var(--ops-line)]"
                    style={{ height: colH }}
                    title={`${d.date}: ${d.aligned}/${d.total} fully aligned (${pct(d.aligned, d.total)}%)`}
                  >
                    {alignPct < 1 ? (
                      <div
                        className="absolute left-0 right-0 top-0 rounded-t-md bg-[var(--ops-rose)]/45"
                        style={{ height: `${Math.round((1 - alignPct) * 100)}%` }}
                      />
                    ) : null}
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-[var(--ops-mint)]/95"
                      style={{ height: `${Math.round(alignPct * 100)}%` }}
                    />
                  </div>
                  <span className="max-w-[2.5rem] truncate text-center font-mono text-[0.6rem] leading-tight text-[var(--ops-subtle)]">
                    {d.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

import type { DailyCompare } from "@/generated/prisma";
import { buildCompareAnalytics, pct } from "@/lib/compareAnalytics";
import { RouteQsuiteInteractiveChart, type QsuiteLegDatum } from "./RouteQsuiteInteractiveChart";

type Props = {
  rows: DailyCompare[];
};

function qataredCount(rows: DailyCompare[]): number {
  return rows.filter((r) => r.plannedQsuiteApi === true && r.actualQsuiteFromTail === false).length;
}

function uniqueRegistrations(rows: DailyCompare[]): number {
  const s = new Set<string>();
  for (const r of rows) {
    const reg = (r.actualRegistration ?? "").trim().toUpperCase();
    if (reg) s.add(reg);
  }
  return s.size;
}

function EquipmentDonut({
  match,
  mismatch,
  unknown,
}: {
  match: number;
  mismatch: number;
  unknown: number;
}) {
  const t = match + mismatch + unknown;
  const a1 = t ? (match / t) * 360 : 0;
  const a2 = t ? (mismatch / t) * 360 : 0;
  const a3 = t ? (unknown / t) * 360 : 0;
  const gradient =
    t === 0
      ? "conic-gradient(from -90deg, rgba(122,143,163,0.35) 0deg 360deg)"
      : `conic-gradient(from -90deg, var(--ops-mint) 0deg ${a1}deg, var(--ops-rose) ${a1}deg ${a1 + a2}deg, rgba(122,143,163,0.45) ${a1 + a2}deg ${a1 + a2 + a3}deg)`;

  return (
    <div
      className="relative mx-auto aspect-square w-[min(11rem,100%)] max-w-[11rem]"
      role="img"
      aria-label={`Equipment vs schedule: ${pct(match, t)}% match, ${pct(mismatch, t)}% mismatch, ${pct(unknown, t)}% not compared`}
    >
      <div
        className="absolute inset-0 rounded-full shadow-[0_0_0_1px_rgba(94,234,212,0.12),0_18px_48px_rgba(0,0,0,0.45)]"
        style={{ background: gradient }}
      />
      <div className="absolute inset-[22%] rounded-full bg-[var(--ops-card)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-[var(--ops-muted)]">
          Match rate
        </p>
        <p className="ops-display mt-0.5 text-2xl text-[var(--ops-fg)]">{t ? pct(match, t) : 0}%</p>
        <p className="mt-0.5 font-mono text-[0.6rem] text-[var(--ops-subtle)]">{t} leg{t === 1 ? "" : "s"}</p>
      </div>
    </div>
  );
}

function serializeQsuiteLegs(rows: DailyCompare[]): QsuiteLegDatum[] {
  return rows.map((r) => ({
    id: r.id,
    compareDate: r.compareDate.toISOString().slice(0, 10),
    routeKey: r.routeKey,
    flight: r.flight,
    plannedQsuiteApi: r.plannedQsuiteApi,
    actualQsuiteFromTail: r.actualQsuiteFromTail,
    matchQsuite: r.matchQsuite,
    actualRegistration: r.actualRegistration,
  }));
}

export function CompareOpsDeck({ rows }: Props) {
  if (rows.length === 0) return null;

  const a = buildCompareAnalytics(rows);
  const qsuiteLegs = serializeQsuiteLegs(rows);
  const qed = qataredCount(rows);
  const tails = uniqueRegistrations(rows);
  const equipDecisive = a.equipmentMatch + a.equipmentMismatch;

  return (
    <section
      id="signal-deck"
      className="ops-reveal ops-reveal-d3 scroll-mt-24 space-y-6"
      aria-labelledby="signal-deck-heading"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ops-kicker">Signal deck</p>
          <h2 id="signal-deck-heading" className="ops-display mt-1 text-2xl text-[var(--ops-fg)] md:text-3xl">
            Tail truth &amp; type alignment
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ops-subtle)]">
            Built from every saved route check above—Qsuite-capable tails by route, how often aircraft type matched
            your schedule, and a couple of numbers worth framing on the wall.
          </p>
        </div>
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--ops-muted)]">
          {a.total} check{a.total === 1 ? "" : "s"}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
        <article className="ops-panel relative overflow-hidden border border-[var(--ops-line-strong)] p-5 shadow-[var(--ops-shadow)] lg:col-span-7 lg:min-h-[320px]">
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-[0.14]"
            style={{
              background: "radial-gradient(circle at 30% 30%, var(--ops-cyan), transparent 62%)",
            }}
          />
          <div className="relative">
            <h3 className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--ops-cyan-dim)]">
              Qsuite timeline · by route
            </h3>
            <p className="mt-1 text-xs text-[var(--ops-subtle)]">
              Each leg is one saved check: cyan bar = airline scheduled Qsuite flag, mint/rose bar = whether the
              operated tail was on the Qsuite-capable list. Hover for the exact date, flight, and registration; use the
              brush strip to zoom dense histories.
            </p>
            <div className="mt-5">
              <RouteQsuiteInteractiveChart legs={qsuiteLegs} />
            </div>
          </div>
        </article>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <article className="ops-panel relative overflow-hidden p-5 shadow-[var(--ops-shadow)]">
            <div
              className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full opacity-[0.12]"
              style={{
                background: "radial-gradient(circle at 60% 60%, var(--ops-copper), transparent 65%)",
              }}
            />
            <div className="relative grid gap-6 sm:grid-cols-[1fr_minmax(0,11rem)] sm:items-center">
              <div>
                <h3 className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--ops-cyan-dim)]">
                  Aircraft type vs schedule
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ops-subtle)]">
                  When the daily job could compare your scheduled family to what actually operated.
                </p>
                <dl className="mt-5 space-y-2.5 font-mono text-[0.72rem]">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--ops-line)] pb-2">
                    <dt className="flex items-center gap-2 text-[var(--ops-muted)]">
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--ops-mint)]" aria-hidden />
                      Aligned
                    </dt>
                    <dd className="text-[var(--ops-fg)]">
                      <span className="text-[var(--ops-mint)]">{a.equipmentMatch}</span>
                      <span className="text-[var(--ops-subtle)]">
                        {" "}
                        ({equipDecisive ? pct(a.equipmentMatch, equipDecisive) : 0}% decisive)
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--ops-line)] pb-2">
                    <dt className="flex items-center gap-2 text-[var(--ops-muted)]">
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--ops-rose)]" aria-hidden />
                      Swapped type
                    </dt>
                    <dd className="text-[var(--ops-fg)]">
                      <span className="text-[var(--ops-rose)]">{a.equipmentMismatch}</span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-[var(--ops-muted)]">
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--ops-muted)]" aria-hidden />
                      Not compared
                    </dt>
                    <dd className="text-[var(--ops-fg)]">{a.equipmentUnknown}</dd>
                  </div>
                </dl>
              </div>
              <EquipmentDonut match={a.equipmentMatch} mismatch={a.equipmentMismatch} unknown={a.equipmentUnknown} />
            </div>
          </article>

          <article className="relative overflow-hidden rounded-2xl border border-[var(--ops-line-strong)] bg-gradient-to-br from-[rgba(17,24,34,0.95)] via-[var(--ops-card)] to-[rgba(6,8,12,0.98)] p-5 shadow-[var(--ops-shadow)]">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-18deg, transparent, transparent 6px, rgba(94,234,212,0.35) 6px, rgba(94,234,212,0.35) 7px)",
              }}
            />
            <div className="relative grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--ops-rose)]/90">
                  The QATAR&apos;ed ledger
                </h3>
                <p className="mt-1 text-xs text-[var(--ops-subtle)]">
                  Legs where you were sold Qsuite but the operated tail wasn&apos;t on the Qsuite-capable list.
                </p>
                <p className="ops-display mt-4 text-5xl leading-none text-[var(--ops-rose)]">{qed}</p>
                <p className="mt-2 font-mono text-[0.62rem] text-[var(--ops-muted)]">
                  {a.total ? pct(qed, a.total) : 0}% of checks · worth a raised eyebrow
                </p>
              </div>
              <div className="border-t border-[var(--ops-line)] pt-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <h3 className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--ops-copper)]">
                  Fleet fingerprints
                </h3>
                <p className="mt-1 text-xs text-[var(--ops-subtle)]">
                  Distinct registrations observed across these checks—how many different tails touched your routes.
                </p>
                <p className="ops-display mt-4 text-5xl leading-none text-[var(--ops-copper)]">{tails}</p>
                <p className="mt-2 font-mono text-[0.62rem] text-[var(--ops-muted)]">
                  Distinct registrations logged on these legs (when the comparison source named a tail).
                </p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

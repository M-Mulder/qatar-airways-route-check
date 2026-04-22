"use client";

import { useMemo, useState } from "react";
import { addDays, endOfMonth, format, getDay, startOfMonth } from "date-fns";

type ApiDay = {
  date: string;
  currency: string;
  price: number | null;
  avios?: number | null;
  businessFullnessPct?: number | null;
  source: "airline_direct" | "list" | "missing";
  error: string | null;
};

type ApiPayload = {
  ok: boolean;
  cached?: boolean;
  monthIso?: string;
  cabin?: string;
  prices?: ApiDay[];
  error?: string;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function Qr274BusinessCalendarClient(props: { monthIso: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);

  const [state, setState] = useState<{ loading: boolean; payload: ApiPayload | null }>({
    loading: true,
    payload: null,
  });

  // Fetch on mount (simple, avoids adding extra libs).
  useMemo(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setState((s) => ({ ...s, loading: true }));
        const qs = new URLSearchParams({ month: props.monthIso });
        if (refreshTick > 0) qs.set("refresh", "1");
        const r = await fetch(`/api/pricing/qr274-business-calendar?${qs.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const j = (await r.json()) as ApiPayload;
        if (!cancelled) setState({ loading: false, payload: j });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) setState({ loading: false, payload: { ok: false, error: message } });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.monthIso, refreshTick]);

  const days = state.payload?.prices ?? [];
  const currency = days.find((d) => d.currency)?.currency || "EUR";
  const best = useMemo(() => {
    const priced = days.filter((d) => typeof d.price === "number") as Array<ApiDay & { price: number }>;
    const min = priced.reduce((a, b) => (b.price < a.price ? b : a), priced[0] as any)?.price ?? null;
    const sorted = [...priced].sort((a, b) => a.price - b.price);
    const top3 = new Set(sorted.slice(0, 3).map((d) => d.date));
    const distinct = new Set(priced.map((d) => d.price)).size;
    return { min, top3, distinct };
  }, [days]);

  const monthStart = startOfMonth(new Date(`${props.monthIso}-01T12:00:00.000Z`));
  const monthEnd = endOfMonth(monthStart);
  const leading = getDay(monthStart); // 0..6 (Sun..Sat)
  const cellDates: Array<string | null> = [];
  for (let i = 0; i < leading; i++) cellDates.push(null);
  for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) cellDates.push(format(d, "yyyy-MM-dd"));
  while (cellDates.length % 7 !== 0) cellDates.push(null);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d] as const)), [days]);
  const selectedDay = selected ? byDate.get(selected) ?? null : null;
  const hoveredDay = hovered ? byDate.get(hovered) ?? null : null;
  const hoverFocus = hoveredDay ?? selectedDay;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="rounded-xl border border-[var(--ops-line)] bg-[var(--ops-card)] p-4 shadow-[var(--ops-shadow)] md:p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--ops-muted)]">Qatar Airways</p>
            <h2 className="ops-display text-2xl text-[var(--ops-fg)] md:text-3xl">
              QR274 AMS → DOH · Business · {props.monthIso}
            </h2>
            <p className="mt-2 text-sm text-[var(--ops-muted)]">
              {state.loading
                ? "Loading prices…"
                : `Best days are highlighted (top 3). Currency: ${currency}. Distinct prices: ${best.distinct || 0}.`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--ops-muted)]">Lowest</div>
            <div className="text-lg font-semibold text-[var(--ops-fg)]">
              {best.min == null ? "—" : fmtMoney(best.min, currency)}
            </div>
            <button
              type="button"
              onClick={() => setRefreshTick((n) => n + 1)}
              className="mt-2 rounded-lg border border-[var(--ops-line)] bg-[var(--ops-card)] px-2 py-1 text-xs text-[var(--ops-fg)] hover:bg-[color-mix(in_oklab,var(--ops-card),black_6%)]"
            >
              Refresh prices
            </button>
          </div>
        </div>

        {!state.loading && state.payload && state.payload.ok === false ? (
          <p className="text-[var(--ops-rose)]">{state.payload.error || "Failed to load prices."}</p>
        ) : null}

        <div className="grid grid-cols-7 gap-2 text-xs text-[var(--ops-muted)]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-1 py-1 text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {cellDates.map((iso, i) => {
            if (!iso) return <div key={`e-${i}`} className="h-20 rounded-lg border border-transparent" />;
            const d = byDate.get(iso) ?? null;
            const price = d?.price ?? null;
            const avios = typeof d?.avios === "number" ? d.avios : null;
            const isTop = best.top3.has(iso);
            const isSelected = selected === iso;
            const isMissing = d?.price == null;
            const tier = avios === 43000 ? "low" : avios === 86000 ? "high" : "none";
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                onMouseEnter={() => setHovered(iso)}
                onMouseLeave={() => setHovered((cur) => (cur === iso ? null : cur))}
                onFocus={() => setHovered(iso)}
                onBlur={() => setHovered((cur) => (cur === iso ? null : cur))}
                className={clsx(
                  "h-[92px] rounded-xl border px-3 py-3 text-left transition",
                  "border-[var(--ops-line)] bg-[color-mix(in_oklab,var(--ops-card),black_2%)] hover:bg-[color-mix(in_oklab,var(--ops-card),black_7%)]",
                  isTop && "ring-2 ring-[var(--ops-accent)]",
                  isSelected && "outline outline-2 outline-offset-2 outline-[var(--ops-accent)]",
                  isMissing && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-base font-semibold text-[var(--ops-fg)]">{iso.slice(-2)}</div>
                  {tier !== "none" ? (
                    <span
                      className={clsx(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight",
                        tier === "low" &&
                          "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
                        tier === "high" &&
                          "border-amber-500/30 bg-amber-500/10 text-amber-200",
                      )}
                    >
                      {avios === 43000 ? "43k" : "86k"} Avios
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 text-base font-semibold text-[var(--ops-fg)]">
                  {price == null ? "—" : fmtMoney(price, currency)}
                </div>
                {price == null ? <div className="mt-1 text-xs text-[var(--ops-muted)]">No price</div> : <div className="mt-1 h-[1em]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ops-line)] bg-[var(--ops-card)] p-4 shadow-[var(--ops-shadow)] md:p-6">
        <h3 className="text-sm font-semibold text-[var(--ops-fg)]">{hoveredDay ? "Hover details" : "Selected day"}</h3>
        <p className="mt-1 text-xs text-[var(--ops-muted)]">
          {hoveredDay ? "Move your mouse across dates to compare quickly." : "Click any day in the calendar to pin details."}
        </p>

        <div className="mt-4 rounded-lg border border-[var(--ops-line)] bg-[color-mix(in_oklab,var(--ops-card),black_2%)] p-3">
          {hoverFocus ? (
            <>
              {(() => {
                const d = hoverFocus!;
                const av = typeof (d as any).avios === "number" ? (d as any).avios : null;
                const fullness =
                  typeof (d as any).businessFullnessPct === "number" ? (d as any).businessFullnessPct : null;
                const fullnessLabel =
                  fullness == null ? "—" : fullness >= 85 ? "Very high" : fullness >= 72 ? "High" : fullness >= 58 ? "Medium" : "Low";
                return (
                  <>
                    <div className="text-sm font-semibold text-[var(--ops-fg)]">{d.date}</div>
                    <div className="mt-1 text-base font-semibold text-[var(--ops-fg)]">
                      {d.price == null ? "No cash price" : fmtMoney(d.price, d.currency)}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ops-fg)]">
                      {av == null ? "No AVIOS price" : `${av.toLocaleString()} AVIOS`}
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-[var(--ops-muted)]">
                        <span>Business fullness</span>
                        <span className="text-[var(--ops-fg)]">
                          {fullness == null ? "—" : `${fullness}%`} · {fullnessLabel}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-[var(--ops-line)] bg-[color-mix(in_oklab,var(--ops-card),black_8%)]">
                        <div
                          className={clsx(
                            "h-full",
                            fullness != null && fullness >= 85 && "bg-rose-400/70",
                            fullness != null && fullness < 85 && fullness >= 72 && "bg-amber-300/70",
                            fullness != null && fullness < 72 && fullness >= 58 && "bg-sky-300/70",
                            fullness != null && fullness < 58 && "bg-emerald-300/70",
                            fullness == null && "bg-[var(--ops-line)]",
                          )}
                          style={{ width: `${Math.max(0, Math.min(100, fullness ?? 0))}%` }}
                        />
                      </div>
                    </div>
                    {d.error ? <div className="mt-2 text-xs text-[var(--ops-rose)]">{d.error}</div> : null}
                  </>
                );
              })()}
            </>
          ) : (
            <div className="text-sm text-[var(--ops-muted)]">Nothing selected yet.</div>
          )}
        </div>

        <div className="mt-6 text-xs text-[var(--ops-muted)]">
          Notes:
          <ul className="mt-2 list-disc pl-5">
            <li>Cash prices come from Google Flights via SerpAPI.</li>
            <li>AVIOS prices are stored in Postgres (seeded as 43k/86k for now).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}


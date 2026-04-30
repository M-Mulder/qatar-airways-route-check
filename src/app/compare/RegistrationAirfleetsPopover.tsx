"use client";

import type { AirfleetsPayload } from "@/lib/airfleets";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  registration: string | null;
  payload: unknown;
};

const LEAVE_MS = 220;

function subscribeCoarse(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(hover: none)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getCoarseSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none)").matches;
}

function getCoarseServerSnapshot() {
  return false;
}

function parsePayload(raw: unknown): AirfleetsPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.fetchedAt !== "string") return null;
  return o as AirfleetsPayload;
}

export function RegistrationAirfleetsPopover({ registration, payload }: Props) {
  const data = parsePayload(payload);
  const coarsePointer = useSyncExternalStore(subscribeCoarse, getCoarseSnapshot, getCoarseServerSnapshot);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  );
  const [panelShift, setPanelShift] = useState(0);
  const regionId = useId();

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  const openFromHover = useCallback(() => {
    if (coarsePointer) return;
    clearLeaveTimer();
    measure();
    setOpen(true);
  }, [clearLeaveTimer, coarsePointer, measure]);

  const scheduleClose = useCallback(() => {
    if (coarsePointer) return;
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => {
      setOpen(false);
      setAnchor(null);
      setPanelShift(0);
    }, LEAVE_MS);
  }, [clearLeaveTimer, coarsePointer]);

  const closeNow = useCallback(() => {
    clearLeaveTimer();
    setOpen(false);
    setAnchor(null);
    setPanelShift(0);
  }, [clearLeaveTimer]);

  useLayoutEffect(() => {
    if (!open || !anchor || !panelRef.current) return;
    const pad = 12;
    const panel = panelRef.current;
    const pw = panel.offsetWidth;
    const idealLeft = anchor.left + anchor.width / 2;
    const minLeft = pad + pw / 2;
    const maxLeft = window.innerWidth - pad - pw / 2;
    const clamped = Math.min(Math.max(idealLeft, minLeft), maxLeft);
    setPanelShift(clamped - idealLeft);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => closeNow();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeNow();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeNow]);

  useEffect(() => {
    if (!open || !coarsePointer) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      closeNow();
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open, coarsePointer, closeNow]);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  if (!registration) {
    return <span className="text-[var(--ops-subtle)]">—</span>;
  }

  /** Any snapshot from `parsePayload` (has `fetchedAt`) is worth the interactive control — not only error/type/msn/detailUrl. Serper often fills aircraftFamily / seats / hex without `detailUrl`. */
  const hasPanel = Boolean(data);

  if (!hasPanel) {
    return (
      <span
        className="ops-table-mono text-[var(--ops-cyan)]"
        title="Aircraft details appear here after the daily check stores them for this tail."
      >
        {registration}
      </span>
    );
  }

  const panel =
    open && anchor && hasPanel && typeof document !== "undefined" ? (
      <div
        ref={panelRef}
        id={regionId}
        role="region"
        aria-live="polite"
        aria-label="Aircraft details"
        className="ops-briefing-popover pointer-events-auto fixed z-[9998] max-w-[min(24rem,calc(100vw-1.5rem))]"
        style={{
          top: anchor.top + anchor.height + 10,
          left: anchor.left + anchor.width / 2 + panelShift,
          transform: "translateX(-50%)",
        }}
        onMouseEnter={coarsePointer ? undefined : clearLeaveTimer}
        onMouseLeave={coarsePointer ? undefined : scheduleClose}
      >
        <div className="ops-briefing-popover__chamfer ops-briefing-popover__chamfer--in">
          <div className="ops-briefing-popover__sheen" aria-hidden />
          <p className="ops-briefing-popover__kicker">Aircraft</p>
          <h3 className="ops-briefing-popover__title" style={{ color: "var(--ops-cyan)" }}>
            {registration}
          </h3>

          {data!.error ? (
            <div className="space-y-2.5">
              <p className="ops-briefing-popover__body text-[var(--ops-amber)]">{data!.error}</p>
              {data!.searchUrl ? (
                <p className="m-0 text-xs leading-snug text-[var(--ops-muted)]">
                  <a
                    className="ops-link font-semibold text-[var(--ops-cyan)]"
                    href={data!.searchUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open search in browser ↗
                  </a>
                  <span className="block pt-1 text-[var(--ops-subtle)]">
                    If lookup failed, retry after the next scheduled check or open the link above in your browser.
                  </span>
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {(data!.aircraftFamily || data!.msn) && (
                <p className="mb-2 text-sm leading-snug text-[var(--ops-muted)]">
                  {[data!.aircraftFamily, data!.msn ? `MSN ${data!.msn}` : null].filter(Boolean).join(" · ")}
                  {data!.airline ? (
                    <>
                      <br />
                      <span className="text-[var(--ops-fg)]">{data!.airline}</span>
                      {data!.lineStatus ? (
                        <span className="text-[var(--ops-subtle)]"> · {data!.lineStatus}</span>
                      ) : null}
                    </>
                  ) : null}
                </p>
              )}

              {(data!.businessSeats != null || data!.economySeats != null) && (
                <div
                  className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-[var(--ops-line-strong)] bg-[var(--ops-card)]/90 p-2.5"
                  data-stagger="1"
                >
                  {data!.businessSeats != null ? (
                    <div className="rounded-md bg-[var(--ops-copper)]/12 px-2 py-1.5 text-center">
                      <div className="font-mono text-lg font-semibold tabular-nums text-[var(--ops-copper)]">
                        {data!.businessSeats}
                      </div>
                      <div className="text-[0.65rem] font-medium uppercase tracking-wide text-[var(--ops-muted)]">
                        Business
                      </div>
                      <div className="text-[0.6rem] text-[var(--ops-subtle)]">cabin C</div>
                    </div>
                  ) : null}
                  {data!.economySeats != null ? (
                    <div className="rounded-md bg-[var(--ops-cyan)]/10 px-2 py-1.5 text-center">
                      <div className="font-mono text-lg font-semibold tabular-nums text-[var(--ops-cyan)]">
                        {data!.economySeats}
                      </div>
                      <div className="text-[0.65rem] font-medium uppercase tracking-wide text-[var(--ops-muted)]">
                        Economy
                      </div>
                      <div className="text-[0.6rem] text-[var(--ops-subtle)]">cabin Y</div>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="ops-briefing-popover__block" data-stagger="2">
                <p className="ops-briefing-popover__label">Aircraft data</p>
                <dl className="ops-briefing-popover__grid">
                  {data!.type ? (
                    <>
                      <dt>Type</dt>
                      <dd>{data!.type}</dd>
                    </>
                  ) : null}
                  {data!.firstFlightDate ? (
                    <>
                      <dt>First flight</dt>
                      <dd>{data!.firstFlightDate}</dd>
                    </>
                  ) : null}
                  {data!.testRegistration ? (
                    <>
                      <dt>Test reg.</dt>
                      <dd className="font-mono">{data!.testRegistration}</dd>
                    </>
                  ) : null}
                  {data!.planeAge ? (
                    <>
                      <dt>Age</dt>
                      <dd>{data!.planeAge}</dd>
                    </>
                  ) : null}
                  {data!.engines ? (
                    <>
                      <dt>Engines</dt>
                      <dd className="text-xs leading-snug">{data!.engines}</dd>
                    </>
                  ) : null}
                  {data!.hexCode ? (
                    <>
                      <dt>Hex</dt>
                      <dd className="font-mono text-xs">{data!.hexCode}</dd>
                    </>
                  ) : null}
                </dl>
              </div>

              {data!.seatConfigRaw && (data!.businessSeats == null || data!.economySeats == null) ? (
                <p className="ops-briefing-popover__foot" data-stagger="3">
                  Seat line: <span className="text-[var(--ops-muted)]">{data!.seatConfigRaw}</span>
                </p>
              ) : null}

              {data!.detailUrl ? (
                <p className="ops-briefing-popover__foot" data-stagger="3">
                  <a
                    className="ops-link text-xs font-semibold"
                    href={data!.detailUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open aircraft page ↗
                  </a>
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ops-table-mono cursor-help border-b border-dotted border-[var(--ops-cyan-dim)] bg-transparent p-0 text-left text-[var(--ops-cyan)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ops-cyan)]"
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        onMouseEnter={openFromHover}
        onMouseLeave={scheduleClose}
        onFocus={openFromHover}
        onBlur={() => {
          if (!coarsePointer) scheduleClose();
        }}
        onClick={(e) => {
          if (!coarsePointer) return;
          e.stopPropagation();
          setOpen((prev) => {
            if (prev) {
              setAnchor(null);
              return false;
            }
            measure();
            return true;
          });
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          setOpen((prev) => {
            if (prev) {
              setAnchor(null);
              return false;
            }
            measure();
            return true;
          });
        }}
      >
        {registration}
      </button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}

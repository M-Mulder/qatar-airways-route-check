"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { buildCompareBriefing, type CompareExplainInput } from "@/lib/compareExplain";

type Props = {
  input: CompareExplainInput;
  badgeLabel: string;
  badgeClassName: string;
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

export function CompareBriefingPopover({ input, badgeLabel, badgeClassName }: Props) {
  const briefing = buildCompareBriefing(input);
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

  const equipAccent =
    briefing.equipment.aligned === true
      ? "var(--ops-mint)"
      : briefing.equipment.aligned === false
        ? "var(--ops-amber)"
        : "var(--ops-muted)";

  const primaryTintVar: Record<typeof briefing.primaryTint, string> = {
    mint: "var(--ops-mint)",
    rose: "var(--ops-rose)",
    amber: "var(--ops-amber)",
    cyan: "var(--ops-cyan)",
    muted: "var(--ops-muted)",
  };

  const panel =
    open && anchor && typeof document !== "undefined" ? (
      <div
        ref={panelRef}
        id={regionId}
        role="region"
        aria-live="polite"
        aria-label="Status details"
        className="ops-briefing-popover pointer-events-auto fixed z-[9999] max-w-[min(22rem,calc(100vw-1.5rem))]"
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
          <p className="ops-briefing-popover__kicker">Summary</p>
          <h3
            className={
              briefing.titleStyle === "technical"
                ? "ops-briefing-popover__title ops-briefing-popover__title--technical"
                : "ops-briefing-popover__title"
            }
            style={{ color: primaryTintVar[briefing.primaryTint] }}
          >
            {briefing.primaryTitle}
          </h3>

          <div className="ops-briefing-popover__block" data-stagger="1">
            <p className="ops-briefing-popover__label">Qsuite</p>
            <dl className="ops-briefing-popover__grid">
              <dt>Schedule</dt>
              <dd>{briefing.qsuite.scheduleQsuiteText}</dd>
              <dt>Tail list</dt>
              <dd>
                {briefing.qsuite.tailQsuiteText}
                {briefing.qsuite.registration ? (
                  <>
                    {" "}
                    <span className="ops-briefing-popover__reg">({briefing.qsuite.registration})</span>
                  </>
                ) : null}
              </dd>
            </dl>
          </div>

          <div
            className="ops-briefing-popover__block ops-briefing-popover__block--equip"
            data-stagger="2"
            style={{ borderLeftColor: equipAccent }}
          >
            <p className="ops-briefing-popover__label">Aircraft type</p>
            <dl className="ops-briefing-popover__grid">
              <dt>Schedule</dt>
              <dd>{briefing.equipment.plannedShort}</dd>
              <dt>Operated</dt>
              <dd>{briefing.equipment.liveShort}</dd>
              <dt>Result</dt>
              <dd>{briefing.equipment.verdictShort}</dd>
            </dl>
          </div>

          {briefing.footnote ? (
            <p className="ops-briefing-popover__foot" data-stagger="3">
              {briefing.footnote}
            </p>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${badgeClassName} cursor-pointer outline-none transition-[transform,filter] duration-200 ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--ops-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ops-base)]`}
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
            const el = triggerRef.current;
            if (el) {
              const r = el.getBoundingClientRect();
              setAnchor({ top: r.top, left: r.left, width: r.width, height: r.height });
            }
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
            const el = triggerRef.current;
            if (el) {
              const r = el.getBoundingClientRect();
              setAnchor({ top: r.top, left: r.left, width: r.width, height: r.height });
            }
            return true;
          });
        }}
      >
        {badgeLabel}
      </button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}

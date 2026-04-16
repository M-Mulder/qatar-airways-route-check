"use client";

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

/**
 * Compact Qsuite hint: stylized Q using theme cyan → copper, matches the “midnight ops” UI.
 * Hover panel is portaled + fixed (like other briefing popovers) so scroll/overflow on tables does not clip it.
 */
export function QsuiteQMark({ className = "", title = "Scheduled Qsuite" }: { className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `qsuite-q-grad-${uid}`;
  const regionId = useId();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [panelShift, setPanelShift] = useState(0);

  const coarsePointer = useSyncExternalStore(subscribeCoarse, getCoarseSnapshot, getCoarseServerSnapshot);

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
    }, 220);
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
  }, [open, anchor, title]);

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

  const panel =
    open && anchor && typeof document !== "undefined" ? (
      <div
        ref={panelRef}
        id={regionId}
        role="tooltip"
        className="ops-briefing-popover pointer-events-auto fixed z-[9999] min-w-[10rem] max-w-[min(16rem,calc(100vw-1.5rem))]"
        style={{
          top: anchor.top - 10,
          left: anchor.left + anchor.width / 2 + panelShift,
          transform: "translate(-50%, -100%)",
        }}
        onMouseEnter={coarsePointer ? undefined : clearLeaveTimer}
        onMouseLeave={coarsePointer ? undefined : scheduleClose}
      >
        <div className="ops-briefing-popover__chamfer ops-briefing-popover__chamfer--in ops-briefing-popover__chamfer--compact">
          <span className="ops-briefing-popover__sheen" aria-hidden="true" />
          <p className="ops-briefing-popover__kicker">Planned</p>
          <p className="ops-briefing-popover__body">{title}</p>
        </div>
      </div>
    ) : null;

  return (
    <>
      <span className={`inline-flex shrink-0 ${className}`}>
        <button
          type="button"
          ref={triggerRef}
          className="inline-flex cursor-help items-center justify-center rounded border border-[var(--ops-line-strong)] bg-[var(--ops-cyan)]/[0.06] px-[3px] py-px text-[var(--ops-cyan)] outline-none ring-[var(--ops-cyan)]/35 transition-[box-shadow,transform] focus-visible:ring-2 hover:scale-[1.04]"
          aria-label={title}
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
          <svg className="h-3 w-[0.65rem]" viewBox="0 0 22 26" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--ops-cyan)" />
                <stop offset="100%" stopColor="var(--ops-copper)" />
              </linearGradient>
            </defs>
            <circle
              cx="11"
              cy="11"
              r="6.65"
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="1.35"
              strokeLinecap="round"
            />
            <path
              d="M15.4 15 L19.8 21.2"
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="1.35"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </span>
      {panel ? createPortal(panel, document.body) : null}
    </>
  );
}

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

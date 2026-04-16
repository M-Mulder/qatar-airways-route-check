"use client";

import { useId } from "react";

/**
 * Compact Qsuite hint: stylized Q using theme cyan → copper, matches the “midnight ops” UI.
 * Hover uses the same chamfer / sheen panel as other briefing popovers (not the native title tooltip).
 */
export function QsuiteQMark({ className = "", title = "Scheduled Qsuite" }: { className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `qsuite-q-grad-${uid}`;

  return (
    <span className={`group/qsuiteQ relative inline-flex shrink-0 ${className}`}>
      <span
        className="inline-flex cursor-help items-center justify-center rounded border border-[var(--ops-line-strong)] bg-[var(--ops-cyan)]/[0.06] px-[3px] py-px text-[var(--ops-cyan)] outline-none ring-[var(--ops-cyan)]/35 transition-[box-shadow,transform] focus-visible:ring-2 group-hover/qsuiteQ:scale-[1.04]"
        aria-label={title}
        role="img"
        tabIndex={0}
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
      </span>

      <span
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-[400] w-max -translate-x-1/2 translate-y-1 pb-2 opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover/qsuiteQ:pointer-events-auto group-hover/qsuiteQ:visible group-hover/qsuiteQ:opacity-100 group-hover/qsuiteQ:translate-y-0 group-focus-within/qsuiteQ:pointer-events-auto group-focus-within/qsuiteQ:visible group-focus-within/qsuiteQ:opacity-100 group-focus-within/qsuiteQ:translate-y-0 max-sm:max-w-[min(16rem,calc(100vw-1.5rem))]"
        aria-hidden="true"
      >
        <span className="ops-briefing-popover">
          <span className="ops-briefing-popover__chamfer ops-briefing-popover__chamfer--in ops-briefing-popover__chamfer--compact">
            <span className="ops-briefing-popover__sheen" aria-hidden="true" />
            <p className="ops-briefing-popover__kicker">Planned</p>
            <p className="ops-briefing-popover__body">{title}</p>
          </span>
        </span>
      </span>
    </span>
  );
}

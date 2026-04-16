"use client";

import { useId } from "react";

/**
 * Compact Qsuite hint: stylized Q using theme cyan → copper, matches the “midnight ops” UI.
 */
export function QsuiteQMark({ className = "", title = "Scheduled Qsuite" }: { className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `qsuite-q-grad-${uid}`;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded border border-[var(--ops-line-strong)] bg-[var(--ops-cyan)]/[0.06] px-[3px] py-px text-[var(--ops-cyan)] ${className}`}
      aria-label={title}
      title={title}
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
  );
}

"use client";

import { useId } from "react";

/**
 * Inline stylized “Q” inspired by Qatar Airways Qsuite wordmark — thin ring + sweeping tail, champagne gold.
 */
export function QsuiteQMark({ className = "", title = "Scheduled Qsuite" }: { className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `qsuite-q-grad-${uid}`;

  return (
    <span className={`inline-flex items-center justify-center ${className}`} aria-label={title}>
      <svg className="h-3.5 w-3 shrink-0" viewBox="0 0 22 26" aria-hidden="true" focusable="false">
        <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f2dcb8" />
          <stop offset="40%" stopColor="#c9a06a" />
          <stop offset="100%" stopColor="#8a6239" />
        </linearGradient>
        </defs>
        <circle
          cx="11"
          cy="11"
          r="6.65"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="1.45"
          strokeLinecap="round"
        />
        <path
          d="M15.4 15 L19.8 21.2"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="1.45"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

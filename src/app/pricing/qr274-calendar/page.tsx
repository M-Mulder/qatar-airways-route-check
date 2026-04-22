import { addMonths, format, startOfMonth } from "date-fns";
import Link from "next/link";
import { Qr274BusinessCalendarClient } from "./Qr274BusinessCalendarClient";

export const dynamic = "force-dynamic";

export default function Qr274CalendarPage() {
  const nextMonthIso = format(startOfMonth(addMonths(new Date(), 1)), "yyyy-MM");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <div className="mb-8 max-w-3xl ops-reveal">
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-[var(--ops-muted)]">Google Flights (SerpAPI)</p>
        <h1 className="ops-display text-3xl text-[var(--ops-fg)] md:text-4xl">Business price calendar</h1>
        <p className="mt-3 text-[var(--ops-muted)] leading-relaxed">
          Interactive calendar for <span className="text-[var(--ops-fg)]">QR274</span> (AMS → DOH),{" "}
          <span className="text-[var(--ops-fg)]">Business</span>, for next month. The best 3 dates are highlighted.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className="rounded-lg border border-[var(--ops-line)] bg-[var(--ops-card)] px-3 py-2 text-sm text-[var(--ops-fg)] hover:bg-[color-mix(in_oklab,var(--ops-card),black_6%)]"
          >
            Back to pricing
          </Link>
        </div>
      </div>

      <Qr274BusinessCalendarClient monthIso={nextMonthIso} />
    </div>
  );
}


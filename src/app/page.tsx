import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Qatar Airways route-check</h1>
        <p className="mt-3 text-lg leading-relaxed text-zinc-600">
          Compare <strong>planned</strong> cabin/equipment signals (from your Qatar CSV export) with{" "}
          <strong>actual</strong> aircraft tails scraped from Flightradar24, then classify Qsuite using a curated
          tail-number list.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">How it works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
          <li>
            Publish <code className="rounded bg-zinc-100 px-1">qatar_segments_export.csv</code> to a raw URL and set{" "}
            <code className="rounded bg-zinc-100 px-1">PLANNED_DATA_URL</code> on Vercel.
          </li>
          <li>
            A daily cron calls <code className="rounded bg-zinc-100 px-1">/api/cron/compare</code> (Bearer{" "}
            <code className="rounded bg-zinc-100 px-1">CRON_SECRET</code>) for <strong>yesterday</strong> (Europe/Amsterdam
            calendar).
          </li>
          <li>
            For each segment (QR274/284 AMS–DOH, QR934 DOH–MNL), we match FR24&apos;s history row and upsert a row in
            Postgres.
          </li>
        </ol>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <strong>Disclaimer:</strong> Flightradar24 pages are not a stable API; HTML parsing may break or be blocked.
        Respect their terms; this project is for personal research only.
      </div>

      <Link
        href="/compare"
        className="inline-flex w-fit items-center rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-800"
      >
        Open dashboard
      </Link>
    </div>
  );
}

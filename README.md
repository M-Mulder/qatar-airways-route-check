# Qatar Airways route-check

Next.js app for **Vercel**: compares **planned** Qatar Airways segment data (from your CSV export) with **actual** tails parsed from [Flightradar24](https://www.flightradar24.com/) flight history HTML, then infers **Qsuite** using the static tail list in [`data/qsuite-tails.json`](data/qsuite-tails.json).

> **Warning:** Scraping FR24 is fragile and may violate their terms of use. Use for personal research; prefer an official API for production.

## Features

- Daily **Vercel Cron** → `GET /api/cron/compare` (secured with `CRON_SECRET`).
- Default compare day: **yesterday** in `Europe/Amsterdam` (override with `?date=YYYY-MM-DD`).
- Segments: **QR274**, **QR284** (AMS–DOH), **QR934** (DOH–MNL) — override with `COMPARE_FLIGHTS=QR274,QR284`.
- Dashboard at **`/compare`** (reads Postgres).

## Setup

```bash
cp env.example .env
# Fill DATABASE_URL, CRON_SECRET, PLANNED_DATA_URL
npm install
npx prisma migrate deploy   # or: npx prisma db push
npm run dev
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL (e.g. [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)) |
| `CRON_SECRET` | Long random string; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `PLANNED_DATA_URL` | HTTPS URL to raw `qatar_segments_export.csv` (same columns as your Python exporter) |
| `COMPARE_FLIGHTS` | Optional; comma-separated subset of `QR274,QR284,QR934` |

## Planned CSV

The parser expects headers including: `query_date`, `flight_number`, `origin`, `destination`, `departure_local`, `vehicle_code`, `vehicle_name`, `vehicle_short`, `qsuite_equipped` — as produced by [`qatar_segments_equipment_report.py`](../schiphol_equipment_scan/qatar_segments_equipment_report.py) in your other project.

Matching uses **`departure_local` date (first 10 chars = YYYY-MM-DD)** as the operational day, aligned with FR24’s DATE column for that leg.

## Database

Prisma schema: [`prisma/schema.prisma`](prisma/schema.prisma). Initial SQL: [`prisma/migrations/20260416150000_init/migration.sql`](prisma/migrations/20260416150000_init/migration.sql).

```bash
npx prisma migrate deploy
```

## Cron (Vercel)

[`vercel.json`](vercel.json) schedules `0 6 * * *` UTC. Ensure the **Cron** integration is enabled on your Vercel project and `CRON_SECRET` is set in project settings.

Manual run:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://<your-deployment>/api/cron/compare"
# Optional backfill:
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://<your-deployment>/api/cron/compare?date=2026-11-15"
```

## Tests

```bash
npm test
```

FR24 parser tests use [`test/fixtures/fr24-qr274-sample.html`](test/fixtures/fr24-qr274-sample.html) (no live network in CI).

## GitHub remote and first push

This folder is a standalone git repo (created by `create-next-app`). Link your empty GitHub repository and push:

```bash
cd qatar-airways-route-check
git remote add origin https://github.com/M-Mulder/qatar-airways-route-check.git
git branch -M main
git add -A
git status
git commit -m "feat: Next.js route-check with planned vs FR24 compare"
git push -u origin main
```

Use SSH remote if you prefer: `git@github.com:M-Mulder/qatar-airways-route-check.git`.

## Publishing planned data

Keep generating CSV with your local Playwright script, then either:

- Commit/push the CSV to a branch and use **raw.githubusercontent.com** as `PLANNED_DATA_URL`, or  
- Upload to **Vercel Blob** / S3 and point the env var to the public URL.

## Learn more

- [Next.js](https://nextjs.org/docs)
- [Prisma](https://www.prisma.io/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

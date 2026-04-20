# Qatar'ed

Product name for this app: **Qatar'ed** — the last-minute aircraft / Qsuite swap situation everyone loves to hate. Repo folder is still `qatar-airways-route-check`.

Next.js app for **Vercel**: compares **planned** Qatar Airways segment data (stored in Postgres as `PlannedSegment` rows, imported from your CSV export) with **actual** tails parsed from [Flightradar24](https://www.flightradar24.com/) flight history HTML, then infers **Qsuite** using the static tail list in [`data/qsuite-tails.json`](data/qsuite-tails.json).

> **Warning:** Scraping FR24 is fragile and may violate their terms of use. Use for personal research; prefer an official API for production.

## Open source

Licensed under the [MIT License](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for local development and [SECURITY.md](SECURITY.md) for reporting issues safely. CI runs `lint`, typecheck, and tests on pushes and pull requests (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

This project is **not affiliated with, endorsed by, or sponsored by** Qatar Airways or Flightradar24. Trademarks belong to their respective owners.

## Features

- **Vercel Cron** (once per day on Hobby) → `GET /api/cron/compare` (secured with `CRON_SECRET`). Each run may fetch **Airfleets.net** once per distinct tail for the registration hover on `/compare`. With **`SERPER_API_KEY`** set, the app uses [**Serper** scrape](https://serper.dev) (`POST https://scrape.serper.dev`) to render Airfleets search + plane URLs and parse the returned plain text — **no Playwright** on that path. Without Serper, optional **Google Programmable Search** (`GOOGLE_CSE_*`) is tried first, then **`playwright-core`** + [**`@sparticuz/chromium`**](https://www.npmjs.com/package/@sparticuz/chromium) on Vercel (Chromium major must track Playwright, e.g. **147** / **1.59**), or **Chrome** locally. Set **`AIRFLEETS_BROWSER=0`** to skip Playwright and use fragile HTTP-only fetches. Cron **`maxDuration`** is **300s** in [`vercel.json`](vercel.json). In **Vercel function logs**, **`[compare] Aircraft payload fetch start`** appears only when a row is about to be saved (Qsuite and equipment must both be decisive). Playwright verbose **`[Airfleets]`** JSON lines default **on** in production; set **`AIRFLEETS_VERBOSE_LOG=0`** to mute them.
- **Without `?date=`**: compares **yesterday, today, and tomorrow** in `Europe/Amsterdam` for each configured segment, but **drops** calendar days before the earliest `departure_local` date present in **PlannedSegment** for those legs (so you do not write empty rows before the export exists). FR24 HTML is fetched **once per flight** per run. Override with `?date=YYYY-MM-DD` for a single-day backfill.
- **Postgres + dashboard**: only rows with a **decisive** Qsuite comparison (**Match** or **Mismatch**) are **saved** and **shown**; inconclusive legs (missing planned API flag or tail / no FR24 row) are removed from the table on each run.
- Segments: **QR274**, **QR284** (AMS–DOH), **QR934** (DOH–MNL) — override with `COMPARE_FLIGHTS=QR274,QR284`.
- **`/`** redirects to **`/compare`** (dashboard: stored compares, upcoming vs past schedule tables, **Signal deck** analytics with a **Recharts** interactive Qsuite timeline per route, equipment match donut, and tail diversity / “QATAR’ed” stats). **`/pricing`** charts daily **Google Flights** prices (SerpAPI) for a fixed **AMS→DOH→MNL** Qatar bundle (economy + business); a **red site-wide banner** appears if the business itinerary no longer lists suite amenities (Qsuite) in the API payload.
- With **`SERPAPI_KEY`**, the same daily cron also writes **`TrackedBundlePriceSnapshot`** rows for that bundle (see [`prisma/schema.prisma`](prisma/schema.prisma)).

## Setup

```bash
cp env.example .env
# Fill DATABASE_URL, CRON_SECRET; run migrations then seed planned segments (see Planned segments)
npm install
npm run dev
```

### Database (read this)

Use a **dedicated empty Postgres database** for this app. Do **not** run `prisma db push` against a shared Retool/demo database: Prisma can **drop tables** that are not in `schema.prisma`.

On a **new** database, create tables with one of:

- [`scripts/create-daily-compare-only.sql`](scripts/create-daily-compare-only.sql) (safe `CREATE TABLE IF NOT EXISTS` + indexes for `DailyCompare` and `PlannedSegment`), then `npx prisma generate`, or  
- `npm run db:migrate` (`migrate deploy` with `.env` / `.env.local` loaded). If Prisma returns **P3005** (schema not empty / no migration history), either [baseline](https://www.prisma.io/docs/guides/migrate/production-troubleshooting#baseline-a-database-with-migrations) or apply SQL manually — for `PlannedSegment` only: `npm run db:apply-planned-migration`.

Optional: keep a personal Vercel checklist in `VERCEL_SETUP.local.md` at the repo root (that name is **gitignored** so it is not committed).

### Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL (e.g. [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)) |
| `CRON_SECRET` | Long random string; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `COMPARE_FLIGHTS` | Optional; comma-separated subset of `QR274,QR284,QR934` |
| `SERPER_API_KEY` | Optional; [Serper.dev](https://serper.dev) API key. When set, Airfleets data for the registration hover is loaded via **`POST https://scrape.serper.dev`** (no Playwright). Serper bills per scrape; keep the key secret and rotate if exposed. |
| `GOOGLE_CSE_API_KEY` | Optional; [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) key. When set with **`GOOGLE_CSE_ID`** (and **no** Serper key), each tail lookup tries **Google’s indexed** Airfleets `ficheapp` snippet first, then falls back to Playwright if needed. |
| `GOOGLE_CSE_ID` | Programmable Search Engine **cx** value (engine must be allowed to return `airfleets.net` results). |
| `SERPAPI_KEY` | Optional; [SerpAPI](https://serpapi.com/) key for **Google Flights** (`engine=google_flights`). When set, the daily cron stores economy + business prices for the tracked bundle and powers **`/pricing`**. Keep the key secret and rotate if exposed. |
| `TRACKED_BUNDLE_*` | Optional; see [`env.example`](env.example) — first/second leg dates, flight numbers (`274,934`), `hl`/`gl`/`currency` for the SerpAPI search. |
| `TRACKED_OFFICIAL_BOOK_WITH` | Optional; default `Qatar Airways`. After each search, a second SerpAPI call loads **booking options**; we store the price only for **`together.airline: true`** and this seller name (not OTAs like BudgetAir). |
| `TRACKED_BUNDLE_ADULTS` | Optional; default **2**. SerpAPI `adults` — stored prices are the **total for all adults** in that currency. |
| `PRICING_VERBOSE` | Optional; set to **`0`** to silence detailed **`[pricing:serp]`** request/response logs (timings, booking-option rows). **`[pricing]`** job logs stay on. |
| `AIRFLEETS_PLAYWRIGHT_GOOGLE_ENTRY` | Optional `1` / `true`: before Airfleets, Playwright runs a **Google** search for **`{registration} Airfleets`** and clicks the first `airfleets.net` link; if it lands on a **`ficheapp/plane-`** page, the Airfleets search step is skipped. **Off by default** (Google often blocks or CAPTCHAs serverless IPs; automated use of Google may conflict with their terms). Similar motivation to open-source tools like [web-agent-master/google-search](https://github.com/web-agent-master/google-search), but we do not bundle that project. |

## Planned segments (database)

Planned legs live in the **`PlannedSegment`** table (not in the repo as a CSV). Generate a CSV with the headers below using your own exporter or tooling (the README previously referenced a sibling-folder Python script as one example), then load it:

```bash
npm run db:migrate
npm run db:seed-planned -- ./path/to/qatar_segments_export.csv
```

That script **replaces** all `PlannedSegment` rows with the file contents. Re-run it whenever you refresh the export.

The importer expects headers including: `query_date`, `flight_id`, `flight_number`, `origin`, `destination`, `departure_local`, `arrival_local`, `vehicle_code`, `vehicle_name`, `vehicle_short`, `duration_sec`, `qsuite_equipped`, `starlink`, `operating_airline`, `offer_origin`, `offer_destination`.

Matching uses **`departure_local` date (first 10 chars = YYYY-MM-DD)** as the operational day, aligned with FR24’s DATE column for that leg.

## Database

Prisma schema: [`prisma/schema.prisma`](prisma/schema.prisma). Migrations: [`prisma/migrations/20260416150000_init/migration.sql`](prisma/migrations/20260416150000_init/migration.sql), [`prisma/migrations/20260416183000_planned_segment/migration.sql`](prisma/migrations/20260416183000_planned_segment/migration.sql), [`prisma/migrations/20260417120000_daily_compare_equipment/migration.sql`](prisma/migrations/20260417120000_daily_compare_equipment/migration.sql) (`actualEquipment`, `matchEquipment` on `DailyCompare`), [`prisma/migrations/20260418180000_airfleets_payload/migration.sql`](prisma/migrations/20260418180000_airfleets_payload/migration.sql) (`airfleetsPayload` JSON on `DailyCompare` for registration hover), [`prisma/migrations/20260420120000_tracked_bundle_price/migration.sql`](prisma/migrations/20260420120000_tracked_bundle_price/migration.sql) (`TrackedBundlePriceSnapshot` for `/pricing`). If `migrate deploy` is blocked, apply SQL manually (e.g. `npm run db:apply-compare-equipment-migration` / `npm run db:apply-airfleets-migration` / `npm run db:apply-tracked-bundle-migration`), then **`npm run db:generate`** and re-run cron.

```bash
npm run db:migrate
```

### Prisma `EPERM` on Windows (`query_engine-windows.dll.node`)

The Prisma client is generated under **`.prisma-client`** at the repo root (see `output` in [`prisma/schema.prisma`](prisma/schema.prisma)), not under `src/` or `node_modules/.prisma/client`, so the engine rename is less likely to hit file locks from the TypeScript language service.

**`npm run db:generate`** runs [`scripts/prisma-generate-safe.mjs`](scripts/prisma-generate-safe.mjs): it clears `.prisma-client` (and best-effort removes legacy `node_modules/.prisma/client`) then runs `prisma generate`. If generate still fails, stop `next dev` / vitest / other Node processes, use **TypeScript: Restart TS Server**, and run `npm run db:generate` again. Fresh clones need `npm install` (postinstall runs generate).

## Deploy (Vercel)

The [`vercel`](https://vercel.com/docs/cli) CLI is a **devDependency**. This repo is a normal Next.js app; [`vercel.json`](vercel.json) defines the **Cron** schedule.

1. **Login and link** (once per machine): `npx vercel login` then `npx vercel link` in the project root (creates a local `.vercel/` folder, gitignored).
2. **Push environment variables** from your merged `.env` + `.env.local` into Vercel (production; add `--preview` for Preview too):

   ```bash
   npm run vercel:sync-env
   # optional:
   npm run vercel:sync-env:preview
   ```

   Sets `DATABASE_URL`, `CRON_SECRET`, `COMPARE_FLIGHTS`, `SERPER_API_KEY`, `SERPAPI_KEY`, and `GOOGLE_CSE_*` when present. Configure any other keys in the [Vercel dashboard](https://vercel.com/docs/projects/environment-variables) if you add them later.

3. **Deploy**: `npm run vercel:deploy` (or connect the GitHub repo in the Vercel dashboard for automatic deployments).

The **build** runs `next build` only (`postinstall` already runs `prisma generate`). Vercel does **not** run `migrate deploy` by default: existing databases (like a shared Retool instance) often hit **P3005** if the schema predates Prisma’s migration table. Apply schema changes with `npm run db:migrate` from a trusted machine, or use `npm run build:with-migrate` only on a **new empty** database after [baselining](https://www.prisma.io/docs/guides/migrate/production-troubleshooting#baseline-a-database-with-migrations).

> **`npx plugins add vercel/vercel-plugin`** is a different tool (editor plugins). Use **`npx vercel`** / **`npm run vercel:deploy`** for deployment.

## Cron (Vercel)

[`vercel.json`](vercel.json) schedules **`GET /api/cron/compare`** **once per day** at **`30 17 * * *`** (17:30 UTC). On the [**Hobby** plan](https://vercel.com/docs/cron-jobs/usage-and-pricing), Vercel only allows **one cron invocation per day**; a second schedule would fail at deploy time.

Roughly, **17:30 UTC** is **18:30** local in Amsterdam during **CET** (winter) and **19:30** during **CEST** (summer). Vercel crons are UTC-only, so adjust expectations if you care about a fixed local wall time year-round.

Ensure **Cron Jobs** are enabled on the project and `CRON_SECRET` is set in Production.

### Run compare on localhost (testing / after Hobby daily limit)

Production cron still uses `vercel.json`, but **Hobby only allows one invocation per day**. To run the **same** job as often as you like (including Airfleets fetches for fleet data on `/compare`), use your local Next server:

1. **Terminal A:** `npm run dev`
2. **Terminal B:** `npm run cron:local`

Optional **single calendar day** (backfill or one-day test):

```bash
npm run cron:local -- 2026-04-16
```

The script reads `CRON_SECRET` (and the rest of the env) from `.env` / `.env.local`, then calls `GET http://127.0.0.1:3000/api/cron/compare` with `Authorization: Bearer …`. Override host/port with **`CRON_LOCAL_BASE`** (e.g. `http://127.0.0.1:3001`) or **`CRON_LOCAL_PORT`**.

The JSON body includes **`trackedBundlePricing`**. If **`/pricing`** stays empty after a run: open that object — **`skipped: true`** usually means **`SERPAPI_KEY`** is missing in that environment, or check **`reason`**. If **`results[].dbError`** mentions a missing table (**P2021** / `TrackedBundlePriceSnapshot`), apply the migration (`npm run db:apply-tracked-bundle-migration` or full migrate). Vercel **function logs** also print **`[pricing]`** lines (search, match, airline-direct price, DB insert). Production must have **`SERPAPI_KEY`** set for the same deployment as the cron (not only locally).

If Airfleets **times out** or stays empty in headless Chromium, set in `.env.local`: **`PLAYWRIGHT_AIRFLEETS_CHANNEL=chrome`** (uses installed Google Chrome, often better with Cloudflare) and/or **`PLAYWRIGHT_AIRFLEETS_HEADED=1`** (visible browser so you can complete any manual check).

**`HTTP 500` — `Unknown argument 'airfleetsPayload'`** means the Postgres column and/or the generated Prisma client are behind [`prisma/schema.prisma`](prisma/schema.prisma) (Airfleets field). Fix:

1. Add the column if missing: `npm run db:apply-airfleets-migration` (idempotent `ADD COLUMN IF NOT EXISTS`).
2. **Stop** `next dev` / `next start` (Windows often locks `.prisma-client\query_engine-windows.dll.node`).
3. Regenerate the client: `npm run db:generate`.
4. Start `npm run dev` again, then `npm run cron:local`.

Manual run on the **deployment** (when quota allows):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://<your-deployment>/api/cron/compare"
# Optional single-day backfill:
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://<your-deployment>/api/cron/compare?date=2026-11-15"
```

### Mock row (UI sample)

With `DATABASE_URL` set, insert a populated **Match** example (2026-04-17 · QR274 · AMS–DOH · A7-AMG):

```bash
npm run db:seed-mock
```

Loads `DATABASE_URL` from `.env` then **`.env.local`** (same as Next.js: local overrides).

### Clear all compare rows

```bash
npm run db:clear-compares
```

### Sample planned rows (demo / placeholder)

To upsert **idempotent placeholder** `PlannedSegment` rows for **2026-04-16** (useful when you do not yet have a real CSV export):

```bash
npm run data:add-april16-sample
```

## Tests

```bash
npm test
```

FR24 parser tests use [`test/fixtures/fr24-qr274-sample.html`](test/fixtures/fr24-qr274-sample.html) (no live network in CI).

## Publishing planned data

Generate a CSV with the columns documented above, then run **`npm run db:seed-planned -- <path-to.csv>`** against each environment’s `DATABASE_URL` (local, Vercel Postgres, etc.). Cron and the dashboard read only from **`PlannedSegment`**.

## Learn more

- [Next.js](https://nextjs.org/docs)
- [Prisma](https://www.prisma.io/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

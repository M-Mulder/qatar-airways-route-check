# Contributing

Thanks for helping improve this project.

## Development

1. Fork the repository and clone your fork.
2. Copy `env.example` to `.env` / `.env.local` and set at least `DATABASE_URL` and `CRON_SECRET` for local work (see `README.md`).
3. `npm install`
4. `npm run dev` for the Next.js app.

## Before you open a pull request

- `npm test` — unit tests (parsers, compare logic, etc.).
- `npm run lint` — ESLint.
- `npx tsc --noEmit` — TypeScript check.

Keep changes focused. Do not commit `.env*`, `.vercel/`, or other secrets (see `.gitignore`).

## Legal / ethics

This app can fetch public flight-history style pages and aircraft reference pages. Scraping may conflict with a site’s terms of use. Use responsibly and prefer official APIs where they exist and you are licensed to use them.

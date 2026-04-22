import { NextResponse } from "next/server";
import { fetchQr274BusinessCalendarMonth } from "@/lib/qr274Calendar";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

type Payload = Awaited<ReturnType<typeof fetchQr274BusinessCalendarMonth>>;
type CacheEntry = { createdAtMs: number; payload: Payload };

declare global {
  // eslint-disable-next-line no-var
  var __qr274CalendarCache: Map<string, CacheEntry> | undefined;
}

function cache(): Map<string, CacheEntry> {
  globalThis.__qr274CalendarCache ??= new Map();
  return globalThis.__qr274CalendarCache;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return jsonError(500, "SERPAPI_KEY not set (required for live calendar prices).");

  const { searchParams } = new URL(req.url);
  const month = (searchParams.get("month") || "").trim();
  const currency = (searchParams.get("currency") || "EUR").trim().toUpperCase();
  const refresh = (searchParams.get("refresh") || "").trim() === "1";

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return jsonError(400, "Invalid month. Expected YYYY-MM (e.g. 2026-05).");
  }

  const ttlMs = 1000 * 60 * 60 * 6;
  const cacheKey = `${month}:${currency}`;
  const hit = refresh ? null : cache().get(cacheKey);
  if (!refresh && hit && Date.now() - hit.createdAtMs < ttlMs) {
    const payload: Payload = hit.payload;
    return NextResponse.json({ ok: true, cached: true, ...payload }, { status: 200 });
  }

  const payload = await fetchQr274BusinessCalendarMonth({
    apiKey: key,
    monthIso: month,
    currency,
    adults: 1,
    concurrency: 3,
  });

  // Merge demo AVIOS from DB when available.
  try {
    if (hasDatabaseUrl()) {
      const prisma = getPrisma();
      if (prisma) {
        const from = new Date(`${month}-01T00:00:00.000Z`);
        const to = new Date(`${month}-31T23:59:59.999Z`);
        const rows = await prisma.awardPriceSnapshot.findMany({
          where: {
            flight: "QR274",
            origin: "AMS",
            destination: "DOH",
            cabin: "BUSINESS",
            program: "AVIOS",
            date: { gte: from, lte: to },
          },
          select: { date: true, avios: true },
        });
        const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r.avios] as const));
        for (const d of payload.prices) {
          d.avios = byDay.get(d.date) ?? null;
        }
      }
    }
  } catch {
    // Demo-only; ignore award DB errors.
  }

  cache().set(cacheKey, { createdAtMs: Date.now(), payload });
  return NextResponse.json({ ok: true, cached: false, ...payload }, { status: 200 });
}

